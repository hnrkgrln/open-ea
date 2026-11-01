const SYMBOLS: Record<string, string> = {
  longrightarrow: '→',
  longleftarrow: '←',
  longleftrightarrow: '↔',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  implies: '⇒',
  uparrow: '↑',
  downarrow: '↓',
  mapsto: '↦',
  to: '→',
  gets: '←',
  iff: '⇔',
};

const COMMANDS = Object.keys(SYMBOLS).sort((a, b) => b.length - a.length).join('|');
const SYMBOL = `\\\\(?:${COMMANDS})`;
const BODY = `\\s*(?:${SYMBOL}\\s*)+`;
const DELIMITED = new RegExp(
  `(?<!\\\\)(?:\\$\\$(?<display>${BODY})\\$\\$|\\$(?!\\$)(?<inline>${BODY})\\$|\\\\\\((?<paren>${BODY})\\\\\\)|\\\\\\[(?<bracket>${BODY})\\\\\\])`,
  'g',
);
const BARE = new RegExp(`\\\\(?:${COMMANDS})\\b`, 'g');

function replaceCommands(value: string) {
  return value.replace(BARE, (token) => SYMBOLS[token.slice(1)] ?? token);
}

/** Turn model LaTeX arrow placeholders such as $\rightarrow$ into arrows. Leaves code spans alone. */
export function renderPlainMath(text: string) {
  const stash: string[] = [];
  const shielded = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, (match) => {
    const token = `\uE000${stash.length}\uE001`;
    stash.push(match);
    return token;
  });
  const replaced = replaceCommands(shielded.replace(DELIMITED, (...args) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>;
    const inner = groups.display ?? groups.inline ?? groups.paren ?? groups.bracket ?? '';
    return replaceCommands(inner).replace(/[ \t]+/g, ' ').trim();
  }));
  return replaced.replace(/\uE000(\d+)\uE001/g, (_match, index) => stash[Number(index)] ?? '');
}
