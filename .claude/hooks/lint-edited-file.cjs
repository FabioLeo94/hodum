let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(data);
    const file = input.tool_input && input.tool_input.file_path;
    if (file && /\.(ts|tsx)$/.test(file)) {
      require("child_process").execSync(`npx eslint "${file}"`, {
        stdio: "inherit",
        cwd: __dirname + "/../..",
      });
    }
  } catch (e) {
    // ignore malformed input or lint failures — this hook is advisory only
  }
});
