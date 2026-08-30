# Image Processing Tools

ModMind uses `sharp` for image decoding and includes a TypeScript implementation of the
PerfectPixel grid-detection and refinement algorithm in the main process. It is compiled
into the Electron application, so PerfectPixel does not require Python, pip, NumPy, Pillow,
or a network connection on the user's machine.

The implementation supports the same sampling modes (`center`, `majority`, and `median`),
manual grid sizes, grid-line refinement, and square-output correction as the upstream
PerfectPixel API. If an image cannot be decoded or processed, ModMind reports the error
and uses the existing deterministic nearest-neighbor fallback.

The background-removal action detects and removes a solid background color using the
bundled `sharp` package. It does not perform semantic (AI-based) subject removal.
