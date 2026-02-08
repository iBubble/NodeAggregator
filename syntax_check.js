const fs = require('fs');
const content = fs.readFileSync('/opt/1panel/apps/my-node-site/Projects/Aggregator/index.html', 'utf8');
// 这里我们要小心提取 script 标签内容。简单的正则可能不够，但对于这个文件应该够用。
// 注意文件里可能包含多个 script 标签，我们需要最大的那个（主逻辑）。
// 或者我们可以直接用 node 运行文件（如果把 html tags 去掉）。

// 更好的方法：只提取最后一个 script 标签的内容。
const scriptMatches = content.match(/<script>([\s\S]*?)<\/script>/g);
if (!scriptMatches) {
    console.log("No script tag found");
    process.exit(1);
}
// 假设主逻辑在最后一个 script 标签里 (通常是这样)
const mainScript = scriptMatches[scriptMatches.length - 1].replace(/<\/?script>/g, '');

try {
    // 尝试解析语法
    // 注意：createApp 是全局变量，这里可能无法运行，但 new Function 至少能检查语法错误 (SyntaxError)
    // 只要不执行它。
    new Function(mainScript);
    console.log("Syntax OK");
} catch (e) {
    console.log("Syntax Error:", e.message);
    // 尝试定位行号
    // 这是相对于 script 块的行号
    // 我们需要加上前面的行数才能对应到 HTML 文件
    console.log("Error details:", e);
}
