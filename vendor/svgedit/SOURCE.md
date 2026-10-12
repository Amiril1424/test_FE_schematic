# SVG-Edit local build

Repository: https://github.com/SVG-Edit/svgedit.git
Commit: c44f061d2f9a626d2771cc931298af5a45522d87
Package version: 7.4.2
Built with Node 22.19.0 using `npm ci` and `npm run build`.

Included: ES editor bundle, stylesheet, icons and jgraduate images.
Default extensions are disabled in editor_bridge.js. No CDN is needed at runtime.
See LICENSE-MIT.txt, licenseInfo.json and bundled license comments.

Source checkout is kept outside the application repository at ../svgedit-source.
On this machine the build used a local Temp checkout because the H: drive
does not support npm's workspace symlinks reliably.
