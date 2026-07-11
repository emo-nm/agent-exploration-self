import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

// This demo's real work runs in app-runtime tools (search/propose/publish),
// not in the sandbox. The default backend (microsandbox) needs a VM/npm
// package that isn't bundled and fails to prewarm on `eve start`, so pin the
// dependency-free just-bash backend to keep the durable HTTP server serving
// locally. Friction noted in findings.
export default defineSandbox({
  backend: justbash(),
});
