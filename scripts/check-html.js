const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[1]))
  .map(match => match[2])
  .filter(source => source.trim());

if (!scripts.length) {
  console.error("No inline JavaScript found in index.html");
  process.exit(1);
}

for (let index = 0; index < scripts.length; index += 1) {
  new vm.Script(scripts[index], { filename: "index.html:inline-script-" + (index + 1) });
}
console.log("Checked " + scripts.length + " inline JavaScript block(s) in index.html");
