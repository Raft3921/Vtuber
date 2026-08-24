# Generated member source notes

All four source portraits were generated at 1254 x 1254 with the approved
Tanutsuna portrait as the style reference and the existing Raft blank-face base
as the alignment reference. The face was intentionally left without eyes,
eyebrows, or a mouth because those assets are supplied by the shared runtime.

Shared prompt constraints: front-facing bust, exact shared head/neck/shoulder
alignment, chroma green background, warm slightly imperfect hand-drawn line,
restrained cel shading with subtle gradients, no glossy AI-rendered finish,
complete scalp coverage, and hair designed as distinct back/upper/front masses
that can be separated without duplicated silhouettes.

- Mai: white layered spiky short hair and a dark green hoodie with a bright green
  ribbed inner collar and centered zipper.
- Yansan: brown hair visible beneath a backward royal-blue cap, orange shirt,
  royal-blue overalls, and white collar.
- Muto: white inner fringe, large dark navy outer spikes, and charcoal hoodie.
- Moron: golden-yellow cat-shaped hair/hood silhouette with two white oval
  markings and a purple kimono-style top.

The generated masters are retained as `parts/source/generated-v1.png` in each
member folder. `scripts/build_generated_members.py` deterministically extracts
the base plate, full rear seam plate, and nine separately movable hair PNGs.
