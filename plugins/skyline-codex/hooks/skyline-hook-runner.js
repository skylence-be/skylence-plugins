const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function toBashPath(filePath) {
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    return `/mnt/${filePath[0].toLowerCase()}${filePath.slice(2).replace(/\\/g, "/")}`;
  }
  return filePath;
}

module.exports = function run(mode) {
  const root = process.env.CODEX_PLUGIN_ROOT || path.resolve(__dirname, "..");

  const script = path.join(root, "hooks", "skyline-enforce.sh");
  if (!fs.existsSync(script)) process.exit(0);

  const result = spawnSync("bash", [toBashPath(script), mode], { stdio: "inherit" });
  if (result.error) process.exit(0);
  process.exit(result.status === null ? 0 : result.status);
};

if (require.main === module) {
  module.exports(process.argv[2] || "");
}
