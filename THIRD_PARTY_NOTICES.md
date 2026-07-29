# Third-Party Notices

## Blockbench

ModMind includes an unmodified offline copy of the official Blockbench Web application.

- Version: 5.1.4
- Upstream commit: `8fe8d9d9568de8233d77cd592744acad495d46b0`
- Project: https://github.com/JannisX11/blockbench
- License: GNU General Public License v3.0 or later

The upstream license, source metadata, build instructions, and file checksums are retained
under `vendor/blockbench`. Distribution of ModMind must preserve these materials and make
the corresponding Blockbench source available as required by its license. The licensing of
the combined distributed application should be reviewed before a public release.

## XMCL Launcher Core

ModMind uses `@xmcl/core` and `@xmcl/installer` for Minecraft metadata parsing,
dependency installation, managed Java runtimes, Fabric installation, and process launch.
These packages are provided under the MIT License by the Voxelum project.

## extract-zip

ModMind uses `extract-zip` to unpack the verified Gradle distribution. It is provided
under the BSD-2-Clause License.

## ffmpeg-static

ModMind uses `ffmpeg-static` to convert imported audio to OGG Vorbis. The packaged
FFmpeg executable is distributed under GPL-3.0-or-later. Its license and build information
are retained beside the executable in the unpacked `node_modules/ffmpeg-static` directory.

- Project: https://github.com/eugeneware/ffmpeg-static
- FFmpeg: https://ffmpeg.org/
- License: GPL-3.0-or-later

## mappings.dev

ModMind can query class and member mapping pages from https://mappings.dev at runtime.
Downloaded indexes and pages are stored as a local cache and are not bundled with the
application. Mapping licenses for each Minecraft version are linked by the upstream site.
