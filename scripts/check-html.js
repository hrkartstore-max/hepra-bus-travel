const fs = require("node:fs");
const vm = require("node:vm");

for (const file of ["index.html", "admin.html"]) {
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
    .filter(match => !/\\bsrc\\s*=/.test(match[1]))
    .map(match => match[2])
    .filter(source => source.trim());

  if (!scripts.length) {
    console.error("No inline JavaScript found in " + file);
    process.exit(1);
  }

  for (let index = 0; index < scripts.length; index += 1) {
    new vm.Script(scripts[index], { filename: file + ":inline-script-" + (index + 1) });
  }
  console.log("Checked " + scripts.length + " inline JavaScript block(s) in " + file);
}
