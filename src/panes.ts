export type LeafKind = "shell" | "claude";

export type Leaf = {
  kind: "leaf";
  id: string;
  title: string;
  cwd?: string;
  shell: LeafKind;
  sessionId?: string;
  ptyId?: string;
};

export type Split = {
  kind: "split";
  id: string;
  direction: "row" | "column";
  children: Pane[];
  ratios: number[];
};

export type Pane = Leaf | Split;

export type NewLeafInput = {
  id?: string;
  title: string;
  cwd?: string;
  shell: LeafKind;
  sessionId?: string;
};

export function makeLeaf(input: NewLeafInput): Leaf {
  return {
    kind: "leaf",
    id: input.id ?? crypto.randomUUID(),
    title: input.title,
    cwd: input.cwd,
    shell: input.shell,
    sessionId: input.sessionId,
  };
}

export function firstLeaf(p: Pane): Leaf {
  return p.kind === "leaf" ? p : firstLeaf(p.children[0]);
}

export function collectLeaves(p: Pane, out: Leaf[] = []): Leaf[] {
  if (p.kind === "leaf") out.push(p);
  else p.children.forEach((c) => collectLeaves(c, out));
  return out;
}

export function findLeaf(p: Pane, id: string): Leaf | null {
  if (p.kind === "leaf") return p.id === id ? p : null;
  for (const c of p.children) {
    const r = findLeaf(c, id);
    if (r) return r;
  }
  return null;
}

export function mapLeaf(
  p: Pane,
  id: string,
  fn: (leaf: Leaf) => Leaf,
): Pane {
  if (p.kind === "leaf") return p.id === id ? fn(p) : p;
  return {
    ...p,
    children: p.children.map((c) => mapLeaf(c, id, fn)),
  };
}

// Normalize: if a Split has one child, collapse it into that child.
function normalize(p: Pane): Pane {
  if (p.kind === "leaf") return p;
  const kids = p.children.map(normalize);
  if (kids.length === 1) return kids[0];
  // Flatten nested same-direction splits
  const flatKids: Pane[] = [];
  const flatRatios: number[] = [];
  kids.forEach((c, i) => {
    if (c.kind === "split" && c.direction === p.direction) {
      const scale = p.ratios[i];
      c.children.forEach((gc, gi) => {
        flatKids.push(gc);
        flatRatios.push(scale * c.ratios[gi]);
      });
    } else {
      flatKids.push(c);
      flatRatios.push(p.ratios[i]);
    }
  });
  return { ...p, children: flatKids, ratios: normalizeRatios(flatRatios) };
}

function normalizeRatios(r: number[]): number[] {
  const s = r.reduce((a, b) => a + b, 0) || 1;
  return r.map((x) => x / s);
}

export function removeLeaf(p: Pane, id: string): Pane | null {
  if (p.kind === "leaf") return p.id === id ? null : p;
  const kept: Pane[] = [];
  const ratios: number[] = [];
  for (let i = 0; i < p.children.length; i++) {
    const c = removeLeaf(p.children[i], id);
    if (c) {
      kept.push(c);
      ratios.push(p.ratios[i]);
    }
  }
  if (kept.length === 0) return null;
  return normalize({
    ...p,
    children: kept,
    ratios: normalizeRatios(ratios),
  });
}

// Split target leaf by direction, inserting a new leaf next to it.
// Returns new root + id of the new leaf (which becomes active).
export function splitLeaf(
  root: Pane,
  targetId: string,
  direction: "row" | "column",
  newLeaf: Leaf,
): { root: Pane; newLeafId: string } {
  let inserted = false;
  const walk = (p: Pane): Pane => {
    if (inserted) return p;
    if (p.kind === "leaf") {
      if (p.id !== targetId) return p;
      inserted = true;
      return {
        kind: "split",
        id: crypto.randomUUID(),
        direction,
        children: [p, newLeaf],
        ratios: [0.5, 0.5],
      };
    }
    // If this split matches direction and contains target directly, insert sibling.
    if (p.direction === direction) {
      const idx = p.children.findIndex(
        (c) => c.kind === "leaf" && c.id === targetId,
      );
      if (idx >= 0) {
        inserted = true;
        const share = p.ratios[idx] / 2;
        const ratios = [
          ...p.ratios.slice(0, idx),
          share,
          share,
          ...p.ratios.slice(idx + 1),
        ];
        const children = [
          ...p.children.slice(0, idx + 1),
          newLeaf,
          ...p.children.slice(idx + 1),
        ];
        return { ...p, children, ratios };
      }
    }
    return { ...p, children: p.children.map(walk) };
  };
  const next = walk(root);
  return { root: normalize(next), newLeafId: newLeaf.id };
}

export function updateRatios(
  p: Pane,
  splitId: string,
  ratios: number[],
): Pane {
  if (p.kind === "leaf") return p;
  if (p.id === splitId) {
    return { ...p, ratios: normalizeRatios(ratios) };
  }
  return { ...p, children: p.children.map((c) => updateRatios(c, splitId, ratios)) };
}
