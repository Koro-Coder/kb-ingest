// Generic LaTeX tokenizer + question-macro parser shared by every subject
// adapter. None of this file knows about Aptitude/Maths/Technical specifics
// — that lives in parsing/adapters/*.js (argMap + resolveImagePath) which is
// passed in by the caller. Lifted from the original Latex Parser's
// parser.js, generalized to accept a per-subject argMap and image resolver
// instead of hardcoding Aptitude's layout. Command vocabulary cross-checked
// against the "PrepFusion Questions Manual" LaTeX documentation.

function stripComments(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] !== '%') {
          continue;
        }
        // \% is an escaped literal percent sign, not a comment marker — only
        // an even number of preceding backslashes (incl. zero) means the %
        // itself is unescaped and really does start a comment.
        let backslashes = 0;
        let j = i - 1;
        while (j >= 0 && line[j] === '\\') {
          backslashes += 1;
          j -= 1;
        }
        if (backslashes % 2 === 0) {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function readBracedArgument(text, start) {
  if (text[start] !== '{') {
    throw new Error("Expected '{' to start an argument");
  }
  let depth = 0;
  let i = start;
  let escaped = false;
  let inMath = false;
  let mathDelimiter = '';
  while (i < text.length) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
      // \[ / \( enter display/inline math; the *closing* \] / \) must be
      // checked independently — conflating them (checking for another \[ to
      // exit \[...\]) leaves inMath stuck true past the real \], silently
      // disabling brace-depth tracking for everything after it until some
      // unrelated later \[ happens to appear, corrupting the argument
      // boundary across question boundaries.
      if (text.startsWith('\\[', i)) {
        if (!inMath) {
          inMath = true;
          mathDelimiter = '\\]';
        }
      } else if (text.startsWith('\\]', i)) {
        if (inMath && mathDelimiter === '\\]') {
          inMath = false;
          mathDelimiter = '';
        }
      } else if (text.startsWith('\\(', i)) {
        if (!inMath) {
          inMath = true;
          mathDelimiter = '\\)';
        }
      } else if (text.startsWith('\\)', i)) {
        if (inMath && mathDelimiter === '\\)') {
          inMath = false;
          mathDelimiter = '';
        }
      }
    } else if (ch === '$') {
      if (!inMath) {
        const next = text[i + 1];
        if (next === '$') {
          inMath = true;
          mathDelimiter = '$$';
          i += 1;
        } else {
          inMath = true;
          mathDelimiter = '$';
        }
      } else if (mathDelimiter === '$') {
        inMath = false;
        mathDelimiter = '';
      } else if (mathDelimiter === '$$') {
        if (text[i + 1] === '$') {
          inMath = false;
          mathDelimiter = '';
          i += 1;
        }
      }
    } else if (!inMath && ch === '{') {
      depth += 1;
    } else if (!inMath && ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { value: text.slice(start + 1, i), nextIndex: i + 1 };
      }
    }
    i += 1;
  }
  return { value: text.slice(start + 1), nextIndex: text.length };
}

function readOptionalArgument(text, start) {
  if (text[start] !== '[') {
    return { value: null, nextIndex: start };
  }
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return { value: text.slice(start + 1, i), nextIndex: i + 1 };
      }
    }
    i += 1;
  }
  throw new Error('Unbalanced optional argument');
}

function readCommand(text, start) {
  let i = start + 1;
  while (i < text.length && /[A-Za-z*]/.test(text[i])) {
    i += 1;
  }
  return { value: text.slice(start + 1, i), nextIndex: i };
}

// `args` keeps every argument in source order; `argKinds` records whether each
// came from [optional] or {braced} syntax. Callers that treat arguments
// positionally MUST filter to braced (see bracedArgs) — an optional argument
// like \InlineOptions[1em]{A}{B}{C}{D} is spacing, not content, and silently
// shifts every positional slot if counted.
function parseCommandArguments(text, start) {
  const { value: command, nextIndex } = readCommand(text, start);
  const args = [];
  const argKinds = [];
  let pos = nextIndex;
  while (pos < text.length) {
    while (pos < text.length && /\s/.test(text[pos])) {
      pos += 1;
    }
    if (pos >= text.length) {
      break;
    }
    if (text[pos] === '[') {
      const opt = readOptionalArgument(text, pos);
      if (opt.value !== null) {
        args.push(opt.value);
        argKinds.push('optional');
      }
      pos = opt.nextIndex;
      continue;
    }
    if (text[pos] === '{') {
      const braced = readBracedArgument(text, pos);
      args.push(braced.value);
      argKinds.push('braced');
      pos = braced.nextIndex;
      continue;
    }
    break;
  }
  return { command, args, argKinds, nextIndex: pos };
}

function bracedArgs(parsed) {
  return parsed.args.filter((_, idx) => parsed.argKinds[idx] === 'braced');
}

function optionalArgs(parsed) {
  return parsed.args.filter((_, idx) => parsed.argKinds[idx] === 'optional');
}

// Commands that mark a legitimate resync point at the top level of a
// chapter file — used below to recover from a malformed question macro
// without guessing at its structure: we don't try to fix or reconstruct it,
// just warn and skip forward to the next thing we can actually parse.
const TOP_LEVEL_RESYNC_COMMANDS = ['MCQ', 'MSQ', 'NAT', 'ChapterDivider', 'CommonData', 'EndChapter', 'YearSession'];

function findNextTopLevelCommand(text, fromIndex) {
  let idx = fromIndex;
  while (idx < text.length) {
    const nextBackslash = text.indexOf('\\', idx);
    if (nextBackslash === -1) {
      return text.length;
    }
    const { value: command } = readCommand(text, nextBackslash);
    const base = command.endsWith('*') ? command.slice(0, -1) : command;
    if (TOP_LEVEL_RESYNC_COMMANDS.includes(base)) {
      return nextBackslash;
    }
    idx = nextBackslash + 1;
  }
  return text.length;
}

// Splits a trailing '*' off a command name (\MCQ* -> {base:'MCQ', starred:true}).
function splitStar(command) {
  if (command.endsWith('*')) {
    return { base: command.slice(0, -1), starred: true };
  }
  return { base: command, starred: false };
}

function pushText(body, value) {
  if (!value) {
    return;
  }
  const prev = body[body.length - 1];
  if (prev && prev.type === 'text') {
    prev.value += value;
  } else {
    body.push({ type: 'text', value });
  }
}

// Used to "unwrap" a formatting command (\textbf{...}, \underline{...}, ...)
// whose argument may itself contain nested commands/math (e.g. \text{\NATBox},
// \textbf{$x$}) — re-parses the inner text instead of pasting it in raw, so
// nothing leaks through as literal backslash-syntax.
function appendParsedContent(body, context, resolveImagePath, innerText) {
  const { body: innerBody } = parseInlineContent(innerText || '', context, resolveImagePath);
  for (const node of innerBody) {
    if (node.type === 'text') {
      pushText(body, node.value);
    } else {
      body.push(node);
    }
  }
}

// Tracks the narrow set of things that represent genuine, unrecoverable
// content loss — NOT every unrecognized command. See UNRENDERABLE_ENVIRONMENTS.
function recordContentLoss(context, command, raw) {
  if (!context.contentLossCommands) {
    return;
  }
  const existing = context.contentLossCommands.get(command);
  if (existing) {
    existing.count += 1;
  } else {
    context.contentLossCommands.set(command, { count: 1, raw });
  }
}

const QUESTION_IMAGE_PATTERN = /\\QuestionFigure(?:NoNumber)?(?:\[([^\]]*)\])?\{([^{}]+)\}/g;

function extractOptionImages(value, context, resolveImagePath) {
  const images = [];
  const pattern = new RegExp(QUESTION_IMAGE_PATTERN.source, 'g');
  let match;
  while ((match = pattern.exec(value)) !== null) {
    images.push({
      type: 'image',
      src: resolveImagePath(match[2], context),
      size: match[1] || '',
      alt: ''
    });
  }
  return images;
}

function createOption(value, context, resolveImagePath) {
  return {
    type: 'option',
    value,
    images: extractOptionImages(value, context, resolveImagePath)
  };
}

// Environments whose content is structured data we genuinely can't flatten
// to text — a tikz diagram is drawing commands with no linear-text form, so
// showing the question without it would be incomplete. This is deliberately
// a short deny-list, not an allowlist: every OTHER environment (choices,
// msqchoices, itemize, enumerate, center, quote, flushright, or anything we
// haven't even seen yet) is just a wrapper around ordinary text — its
// \begin/\end tokens are dropped and the content inside flows through
// normally, no warning needed.
// Note \begin{figure} is deliberately NOT here: it just wraps an
// \includegraphics (which we render) plus a \caption whose text is real
// content. \begin{tabular} is handled separately too — it becomes a real
// table node rather than being skipped (see parseTabular).
const UNRENDERABLE_ENVIRONMENTS = new Set(['tikzpicture']);

// For an unrenderable environment we can't sensibly flow as prose — left to
// the normal char-by-char walk, a table's cell text would leak into the
// body as meaningless fragments. Skip the whole span in one shot instead,
// from just after \begin{env}'s own args to its matching \end{env} (simple
// same-name nesting counter, no need to be cleverer than that for real
// content). Returns the index right after that \end{env}.
function skipUnknownEnvironment(text, envName, fromIndex) {
  const beginToken = `\\begin{${envName}}`;
  const endToken = `\\end{${envName}}`;
  let depth = 1;
  let pos = fromIndex;
  while (pos < text.length) {
    const nextBegin = text.indexOf(beginToken, pos);
    const nextEnd = text.indexOf(endToken, pos);
    if (nextEnd === -1) {
      return text.length;
    }
    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth += 1;
      pos = nextBegin + beginToken.length;
      continue;
    }
    depth -= 1;
    pos = nextEnd + endToken.length;
    if (depth === 0) {
      return pos;
    }
  }
  return text.length;
}

// Returns the raw text between \begin{env}'s arguments and its matching
// \end{env}, or null if the environment is never closed.
function readEnvironmentBody(text, envName, fromIndex) {
  const endToken = `\\end{${envName}}`;
  const nextIndex = skipUnknownEnvironment(text, envName, fromIndex);
  const bodyEnd = nextIndex - endToken.length;
  if (bodyEnd < fromIndex || text.slice(bodyEnd, nextIndex) !== endToken) {
    return null;
  }
  return { body: text.slice(fromIndex, bodyEnd), nextIndex };
}

// Splits on a delimiter only where it is structurally top-level: not nested
// inside braces, not inside $…$ math, and not escaped (\&, \%). Used for both
// tabular row (\\) and cell (&) splitting, which differ only in the delimiter.
function splitTopLevel(text, matchDelimiter) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inMath = false;
  let i = 0;

  while (i < text.length) {
    if (text[i] === '\\' && text[i + 1] !== undefined) {
      const delimLength = depth === 0 && !inMath ? matchDelimiter(text, i) : 0;
      if (delimLength) {
        parts.push(current);
        current = '';
        i += delimLength;
        continue;
      }
      if (!/[A-Za-z]/.test(text[i + 1])) {
        // Escaped literal (\&, \%, \$) — copy both chars so it can never be
        // mistaken for a delimiter or a brace.
        current += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      current += text[i];
      i += 1;
      continue;
    }

    const delimLength = depth === 0 && !inMath ? matchDelimiter(text, i) : 0;
    if (delimLength) {
      parts.push(current);
      current = '';
      i += delimLength;
      continue;
    }

    const ch = text[i];
    if (ch === '$') {
      inMath = !inMath;
    } else if (!inMath && ch === '{') {
      depth += 1;
    } else if (!inMath && ch === '}') {
      depth -= 1;
    }
    current += ch;
    i += 1;
  }

  parts.push(current);
  return parts;
}

const matchRowDelimiter = (text, i) => (text.startsWith('\\\\', i) ? 2 : 0);
const matchCellDelimiter = (text, i) => (text[i] === '&' ? 1 : 0);

// Rules attach to whichever cell follows them (\hline typically leads a row),
// so they must be consumed before a cell can be inspected for \multicolumn.
const TABLE_RULE_COMMANDS = new Set([
  'hline', 'cline', 'rowcolor', 'cellcolor', 'columncolor',
  'toprule', 'midrule', 'bottomrule', 'noalign'
]);

function stripLeadingRules(text) {
  let remaining = text.trim();
  while (remaining[0] === '\\') {
    const parsed = parseCommandArguments(remaining, 0);
    if (!TABLE_RULE_COMMANDS.has(parsed.command)) {
      break;
    }
    remaining = remaining.slice(parsed.nextIndex).trim();
  }
  return remaining;
}

// \multicolumn{n}{spec}{content} — the only structural table feature we
// support, mapping directly onto an HTML colspan.
function parseTableCell(raw, context, resolveImagePath) {
  const trimmed = stripLeadingRules(raw);
  let colspan = 1;
  let inner = trimmed;

  if (trimmed.startsWith('\\multicolumn')) {
    const parsed = parseCommandArguments(trimmed, 0);
    if (parsed.command === 'multicolumn' && parsed.args.length >= 3) {
      const span = Number(parsed.args[0]);
      colspan = Number.isFinite(span) && span > 0 ? span : 1;
      // Anything trailing the \multicolumn (rare) still belongs in the cell.
      inner = parsed.args[2] + trimmed.slice(parsed.nextIndex);
    }
  }

  const { body } = parseInlineContent(inner, context, resolveImagePath);
  return { colspan, content: body };
}

// Converts a tabular body into a table node. Cell contents run back through
// parseInlineContent, so math/bold/images inside cells render exactly as they
// do anywhere else. Rules (\hline, \cline, \rowcolor) are dropped as silent
// commands, so an all-empty row is just a rule artifact and gets discarded.
function parseTabular(bodyText, context, resolveImagePath) {
  const rows = [];
  for (const rawRow of splitTopLevel(bodyText, matchRowDelimiter)) {
    const cells = splitTopLevel(rawRow, matchCellDelimiter).map((cell) =>
      parseTableCell(cell, context, resolveImagePath)
    );
    if (cells.some((cell) => cell.content.length > 0)) {
      rows.push(cells);
    }
  }
  return rows.length ? { type: 'table', rows } : null;
}

const LIST_ENVIRONMENTS = new Set(['itemize', 'enumerate']);

// Splits a list body on its top-level \item markers. "Top level" here also
// means outside any *nested* list: a nested \begin{itemize} is left intact
// inside its parent item, so parseInlineContent recurses into it naturally
// and produces a nested list node.
function splitListItems(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  let envDepth = 0;
  let inMath = false;
  let started = false;
  let i = 0;

  while (i < text.length) {
    if (text[i] === '\\') {
      if (text.startsWith('\\begin', i)) {
        const parsed = parseCommandArguments(text, i);
        if (parsed.args[0] && LIST_ENVIRONMENTS.has(parsed.args[0])) {
          envDepth += 1;
        }
        current += text.slice(i, parsed.nextIndex);
        i = parsed.nextIndex;
        continue;
      }
      if (text.startsWith('\\end', i)) {
        const parsed = parseCommandArguments(text, i);
        if (parsed.args[0] && LIST_ENVIRONMENTS.has(parsed.args[0])) {
          envDepth -= 1;
        }
        current += text.slice(i, parsed.nextIndex);
        i = parsed.nextIndex;
        continue;
      }
      if (
        text.startsWith('\\item', i) &&
        !/[A-Za-z]/.test(text[i + 5] || '') &&
        depth === 0 &&
        envDepth === 0 &&
        !inMath
      ) {
        if (started) {
          parts.push(current);
        }
        started = true;
        current = '';
        i += 5;
        continue;
      }
      if (text[i + 1] !== undefined && !/[A-Za-z]/.test(text[i + 1])) {
        current += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      current += text[i];
      i += 1;
      continue;
    }

    const ch = text[i];
    if (ch === '$') {
      inMath = !inMath;
    } else if (!inMath && ch === '{') {
      depth += 1;
    } else if (!inMath && ch === '}') {
      depth -= 1;
    }
    current += ch;
    i += 1;
  }

  if (started) {
    parts.push(current);
  }
  return parts;
}

// Converts a list body into a list node. An \item's optional argument is its
// custom marker (\item[(I)] — common in "Statement (I)/(II)" questions), so
// it is kept rather than folded into the item text.
function parseList(envName, bodyText, context, resolveImagePath) {
  const items = [];
  for (const rawItem of splitListItems(bodyText)) {
    let itemText = rawItem.replace(/^\s+/, '');
    let label = null;
    try {
      const optional = readOptionalArgument(itemText, 0);
      if (optional.value !== null) {
        label = collapseWhitespace(optional.value);
        itemText = itemText.slice(optional.nextIndex);
      }
    } catch (error) {
      // Unbalanced '[' — treat it as ordinary item text rather than failing.
    }
    const { body } = parseInlineContent(itemText, context, resolveImagePath);
    if (body.length > 0) {
      items.push({ label, content: body });
    }
  }
  return items.length ? { type: 'list', ordered: envName === 'enumerate', items } : null;
}

// Commands that carry no visible content of their own once digitized
// (print-only layout hints, blank-answer rules, or preamble-style
// declarations) — safe to drop silently, never warned about. Checked at
// both the question-body level and the top level (between questions), since
// authors commonly write e.g. \noindent\NAT{...} with no space.
// Table rules/colour switches are listed here too: they take arguments that
// are styling data, not text (\rowcolor[HTML]{0000FF}, \cline{2-3}), so the
// generic "unwrap the last argument" fallback would otherwise inject "0000FF"
// or "2-3" straight into a cell as visible content.
const SILENT_COMMANDS = new Set([
  'NATBox', 'hspace', 'noindent', 'newpage', 'item',
  'quad', 'hfill', 'medskip', 'smallskip', 'centering', 'small', 'footnotesize',
  'nopagebreak', 'renewcommand', 'setlength', 'providecommand', 'setcounter',
  'par', 'vspace', 'rule', 'displaystyle',
  'hline', 'cline', 'rowcolor', 'cellcolor', 'columncolor', 'color',
  'toprule', 'midrule', 'bottomrule', 'arraybackslash'
]);

// Zero-argument commands equivalent to \\ (LaTeX's own line break) — dropped
// but replaced with a space so words on either side don't run together.
const LINE_BREAK_COMMANDS = new Set(['newline']);

// Zero-argument commands that stand for a literal character — legacy content
// sometimes uses \dots\dots as a manual fill-in-the-blank marker (the doc
// says to use \NATBox for that instead, but older files predate it).
const SYMBOL_COMMANDS = { dots: '…', ldots: '…', rupee: '₹' };

// Environments that are legitimately real math (KaTeX renders these) — a
// math-delimited span containing \begin{X} for any other X (tabular,
// center, figure, ...) isn't actually math at all, just a document
// environment an author mistakenly wrapped in $/\[ \] to force it onto its
// own line. Route those through the normal command parser instead of KaTeX,
// which would otherwise just dump the raw source as its error fallback.
const MATH_SAFE_ENVIRONMENTS = new Set([
  'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix',
  'cases', 'array', 'aligned', 'gathered', 'split'
]);

function isNonMathEnvironmentSpan(value) {
  const match = /\\begin\{([^}]+)\}/.exec(value);
  return Boolean(match && !MATH_SAFE_ENVIRONMENTS.has(match[1]));
}

// `display` distinguishes $$...$$ and \[...\] from $...$ and \(...\), and is
// what sets KaTeX's displayMode at render time. It is not only cosmetic:
// \tag{} is rejected outright in inline mode (KaTeX then prints the equation's
// own source instead of rendering it), and \sum / \int / \lim put their limits
// beside the operator rather than above and below it.
function pushMathOrContent(body, context, resolveImagePath, value, display) {
  if (isNonMathEnvironmentSpan(value)) {
    appendParsedContent(body, context, resolveImagePath, value);
  } else {
    // Set only when true, so inline nodes keep exactly the shape they have had
    // all along and nothing downstream has to be updated for them.
    body.push(display ? { type: 'math', value, display: true } : { type: 'math', value });
  }
}

// context is mutated as we walk (e.g. \YearSession updates context.chapterFolder
// for the Aptitude adapter, contentLossCommands accumulates across the whole file);
// resolveImagePath(rawSrc, context) -> repo-relative path.
function parseInlineContent(content, context, resolveImagePath) {
  const body = [];
  const options = [];
  let i = 0;

  while (i < content.length) {
    if (content.startsWith('$$', i)) {
      const end = content.indexOf('$$', i + 2);
      const value = end === -1 ? content.slice(i + 2) : content.slice(i + 2, end);
      pushMathOrContent(body, context, resolveImagePath, value, true);
      i = end === -1 ? content.length : end + 2;
      continue;
    }

    if (content[i] === '$') {
      const end = content.indexOf('$', i + 1);
      const value = end === -1 ? content.slice(i + 1) : content.slice(i + 1, end);
      pushMathOrContent(body, context, resolveImagePath, value, false);
      i = end === -1 ? content.length : end + 1;
      continue;
    }

    if (content.startsWith('\\[', i)) {
      const end = content.indexOf('\\]', i + 2);
      const value = end === -1 ? content.slice(i + 2) : content.slice(i + 2, end);
      pushMathOrContent(body, context, resolveImagePath, value, true);
      i = end === -1 ? content.length : end + 2;
      continue;
    }

    if (content.startsWith('\\(', i)) {
      // \(...\) is the third standard LaTeX inline-math delimiter (alongside
      // $...$ and $$...$$) — genuinely valid source, just previously
      // unhandled here, which left math commands like \overline inside it
      // evaluated as plain prose and flagged as "unrecognized".
      const end = content.indexOf('\\)', i + 2);
      const value = end === -1 ? content.slice(i + 2) : content.slice(i + 2, end);
      pushMathOrContent(body, context, resolveImagePath, value, false);
      i = end === -1 ? content.length : end + 2;
      continue;
    }

    if (content.startsWith('\\\\', i)) {
      // \\ is LaTeX's own line-break, not a named macro — readCommand would
      // otherwise mis-split it into two bogus empty-name "commands".
      pushText(body, ' ');
      i += 2;
      continue;
    }

    if (content[i] === '\\' && content[i + 1] !== undefined && !/[A-Za-z*]/.test(content[i + 1])) {
      // \%, \&, \_, \#, \$, \{, \}, \  — an escaped literal character, not a
      // macro invocation. readCommand would read this as an empty command
      // name and misfire the unknown-command tracker.
      pushText(body, content[i + 1]);
      i += 2;
      continue;
    }

    if (content[i] === '\\') {
      const parsed = parseCommandArguments(content, i);
      const { command, args, nextIndex } = parsed;
      const { base: commandBase } = splitStar(command);

      if (['MCQ', 'MSQ', 'NAT'].includes(commandBase) || SOLUTION_COMMANDS.includes(commandBase)) {
        break;
      }
      // Solution-only enhancement blocks. Each wraps real content that must
      // render as its own labelled section, so they become block nodes rather
      // than being unwrapped inline.
      if (commandBase === 'Method') {
        const braced = bracedArgs(parsed);
        const { body: inner } = parseInlineContent(braced[1] || '', context, resolveImagePath);
        body.push({ type: 'method', label: collapseWhitespace(braced[0] || ''), content: inner });
        i = nextIndex;
        continue;
      }
      if (commandBase === 'KeyPoints' || commandBase === 'MistakesToAvoid') {
        const braced = bracedArgs(parsed);
        const { body: inner } = parseInlineContent(braced[0] || '', context, resolveImagePath);
        body.push({
          type: commandBase === 'KeyPoints' ? 'keypoints' : 'mistakes',
          content: inner
        });
        i = nextIndex;
        continue;
      }
      if (commandBase in SYMBOL_COMMANDS) {
        pushText(body, SYMBOL_COMMANDS[commandBase]);
        i = nextIndex;
        continue;
      }
      // \includegraphics is the raw LaTeX form of the same thing the template
      // wraps as \QuestionFigure(NoNumber): an optional size spec followed by
      // a path, with identical path semantics. Authors deviating from the
      // template macro is a style issue, not a reason to drop the image — so
      // render it the same way rather than treating it as content loss.
      if (
        commandBase === 'QuestionFigure' ||
        commandBase === 'QuestionFigureNoNumber' ||
        commandBase === 'SolutionFigure' ||
        commandBase === 'includegraphics'
      ) {
        const braced = bracedArgs(parsed);
        const optional = optionalArgs(parsed);
        body.push({
          type: 'image',
          src: resolveImagePath(braced[0] || '', context),
          size: optional[0] || '',
          alt: ''
        });
        i = nextIndex;
        continue;
      }
      if (['InlineOptions', 'InlineOptionsOneLine'].includes(commandBase)) {
        // Braced only: \InlineOptions[1em]{A}{B}{C}{D} takes an optional
        // spacing argument, which must never be mistaken for option (A).
        bracedArgs(parsed).forEach((arg) => options.push(createOption(arg, context, resolveImagePath)));
        i = nextIndex;
        continue;
      }
      if (commandBase === 'begin' && args[0] === 'tabular') {
        const env = readEnvironmentBody(content, 'tabular', nextIndex);
        // A nested tabular can't be expressed in our flat row/cell model, so
        // it stays a content-loss case; everything else becomes a real table.
        const nested = env ? env.body.includes('\\begin{tabular}') : false;
        const table = env && !nested ? parseTabular(env.body, context, resolveImagePath) : null;
        if (table) {
          body.push(table);
          i = env.nextIndex;
          continue;
        }
        const skipTo = skipUnknownEnvironment(content, 'tabular', nextIndex);
        recordContentLoss(context, 'begin{tabular}', content.slice(i, Math.min(skipTo, i + 160)));
        i = skipTo;
        continue;
      }
      if (commandBase === 'begin' && args[0] && LIST_ENVIRONMENTS.has(args[0])) {
        // \begin{choices}/\Option is the option markup and is handled
        // elsewhere; itemize/enumerate here are genuine prose lists (Key
        // Points, "Statement (I)/(II)" question stems).
        const env = readEnvironmentBody(content, args[0], nextIndex);
        const list = env ? parseList(args[0], env.body, context, resolveImagePath) : null;
        if (list) {
          body.push(list);
          i = env.nextIndex;
          continue;
        }
        if (env) {
          i = env.nextIndex;
          continue;
        }
      }
      if (commandBase === 'begin' || commandBase === 'end') {
        if (args[0] && UNRENDERABLE_ENVIRONMENTS.has(args[0])) {
          if (commandBase === 'begin') {
            const skipTo = skipUnknownEnvironment(content, args[0], nextIndex);
            recordContentLoss(context, `begin{${args[0]}}`, content.slice(i, Math.min(skipTo, i + 160)));
            i = skipTo;
            continue;
          }
          // A bare \end{env} with no \begin{env} we walked through ourselves
          // (its \begin was already consumed wholesale above) — just drop it.
        }
        // Any other environment (choices, msqchoices, itemize, enumerate,
        // center, quote, ...) is just a text wrapper — drop the begin/end
        // token and let its content flow through normally below.
        i = nextIndex;
        continue;
      }
      if (commandBase === 'Option') {
        if (args[0]) {
          options.push(createOption(args[0], context, resolveImagePath));
        }
        i = nextIndex;
        continue;
      }
      if (commandBase === 'YearSession') {
        if (args[0]) {
          context.chapterFolder = args[0].replace(/\\/g, '/');
        }
        i = nextIndex;
        continue;
      }
      if (commandBase === 'ChapterDivider' || commandBase === 'CommonData' || commandBase === 'EndChapter') {
        // These are top-level (chapter-file-scope) commands; if one shows up
        // mid-question-body something is structurally odd, but there's
        // nothing useful to render from it here either way.
        i = nextIndex;
        continue;
      }
      if (commandBase === 'underline') {
        const inner = (args[0] || '').trim();
        const isBlankPlaceholder = /^\\hspace\*?\{[^{}]*\}$/.test(inner);
        if (!isBlankPlaceholder) {
          appendParsedContent(body, context, resolveImagePath, args[0]);
        }
        i = nextIndex;
        continue;
      }
      if (LINE_BREAK_COMMANDS.has(commandBase)) {
        pushText(body, ' ');
        i = nextIndex;
        continue;
      }
      if (SILENT_COMMANDS.has(commandBase)) {
        i = nextIndex;
        continue;
      }

      // Anything else outside our fixed template vocabulary is presumed to
      // be an ordinary LaTeX styling/wrapper command (\textbf, \color,
      // \small, \framebox, \uppercase, ...) — a real LaTeX engine or KaTeX
      // (inside math) would render these fine; we just can't reproduce the
      // styling. The words are still real question content though, so keep
      // whatever text argument it took and drop only the command wrapper —
      // no warning, this is normal LaTeX, not a sign of anything broken.
      // Braced only — an optional argument is styling data (\textcolor[HTML]
      // {FF0000}{real text}), never the text we want to keep.
      const unwrappable = bracedArgs(parsed);
      if (unwrappable.length > 0) {
        appendParsedContent(body, context, resolveImagePath, unwrappable[unwrappable.length - 1]);
      }
      i = nextIndex;
      continue;
    }

    if (content[i] === '\n' || content[i] === '\r' || content[i] === '\t') {
      pushText(body, ' ');
      i += 1;
      continue;
    }

    pushText(body, content[i]);
    i += 1;
  }

  const normalizedBody = [];
  for (const node of body) {
    if (node.type === 'text') {
      const value = collapseWhitespace(node.value);
      if (value) {
        normalizedBody.push({ type: 'text', value });
      }
    } else {
      normalizedBody.push(node);
    }
  }
  return { body: normalizedBody, options };
}

// Solution macros, per the PrepFusion Solutions Manual. The documented spine
// is 8 arguments {chapter}{year}{qno}{marks}{answer}{difficulty}{video}{body},
// but Aptitude drops the leading chapter (it is organised by session, not
// chapter) — so the arity comes from the adapter's solutionArgMap, not from
// a constant here.
const SOLUTION_COMMANDS = ['MCQSol', 'MSQSol', 'NATSol'];

// Parses a solution file into solutions keyed by their question number. We
// deliberately key on (file, questionNum) rather than the printed Q-id: the
// Aptitude question ids omit the session, so they are not unique across a
// book, whereas the solution file always mirrors exactly one question file.
function parseSolutions(tex, adapter, fileContext = {}) {
  const argMap = adapter.solutionArgMap;
  const { resolveImagePath } = adapter;
  const cleaned = stripComments(tex);
  const context = { chapterFolder: '', contentLossCommands: new Map(), ...fileContext };
  const solutions = [];
  const warnings = [];
  let i = 0;

  while (i < cleaned.length) {
    if (cleaned[i] !== '\\') {
      i += 1;
      continue;
    }
    const parsed = parseCommandArguments(cleaned, i);
    const { command, nextIndex } = parsed;
    const { base: commandBase } = splitStar(command);

    if (!SOLUTION_COMMANDS.includes(commandBase)) {
      i = nextIndex;
      continue;
    }

    const braced = bracedArgs(parsed);
    const raw = cleaned.slice(i, Math.min(nextIndex, i + 240));
    try {
      if (braced.length < argMap.length) {
        throw new Error(
          `Expected ${argMap.length} arguments for \\${command}, got ${braced.length} — solution skipped, verify the source`
        );
      }
      const fields = {};
      argMap.forEach((field, idx) => {
        fields[field] = braced[idx];
      });
      // A stray extra argument pushes the body to the tail, same recovery as
      // for questions.
      if (braced.length > argMap.length) {
        fields.content = braced[braced.length - 1];
        warnings.push({
          command,
          message: `Expected ${argMap.length} arguments for \\${command}, got ${braced.length} — used the last argument as the solution body; verify by hand`,
          raw,
          excluded: false
        });
      }

      const questionNum = Number(String(fields.questionNum).trim());
      const year = Number(String(fields.year).trim());
      if (!Number.isFinite(questionNum)) {
        throw new Error(`Non-numeric question number ("${fields.questionNum}")`);
      }

      const { body } = parseInlineContent(fields.content || '', context, resolveImagePath);
      solutions.push({
        questionNum,
        year: Number.isFinite(year) ? year : null,
        solutionType: commandBase,
        answer: fields.answer,
        marks: fields.marks,
        difficulty: fields.difficulty || '',
        video: (fields.video || '').trim(),
        body
      });
    } catch (error) {
      warnings.push({ command, message: error.message, raw, excluded: true });
    }
    i = nextIndex;
  }

  return { solutions, warnings };
}

// Scans arbitrary text for every top-level invocation of \commandName{...}...
// and returns their arguments — used by adapters to pull chapter/branch
// display names out of structural macros like \ChapterWithBranches or
// \ChapterDivider without hardcoding a subject-specific regex.
function findCommandInvocations(text, commandName) {
  const cleaned = stripComments(text);
  const results = [];
  let i = 0;
  while (i < cleaned.length) {
    if (cleaned[i] !== '\\') {
      i += 1;
      continue;
    }
    if (cleaned.startsWith(`\\${commandName}`, i)) {
      const followingChar = cleaned[i + 1 + commandName.length];
      if (followingChar === undefined || !/[A-Za-z*]/.test(followingChar)) {
        const parsed = parseCommandArguments(cleaned, i);
        results.push({ args: parsed.args, index: i });
        i = parsed.nextIndex;
        continue;
      }
    }
    i += 1;
  }
  return results;
}

// Unescapes common LaTeX text escapes for use in plain display labels
// (chapter/branch names) — never used on question body/math content, which
// needs to keep its LaTeX fidelity for KaTeX rendering.
function unescapeLatexText(value) {
  return String(value || '')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
    .replace(/\\\$/g, '$')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const QUESTION_COMMANDS = ['MCQ', 'MSQ', 'NAT'];

// The option constructs the template defines. Used only for diagnostics: if a
// question extracted zero options but one of these sits immediately after its
// closing brace, the options were written OUTSIDE the content argument (a
// misplaced-brace slip) rather than in some format we failed to recognize —
// two very different fixes, so the warning should say which one it is.
const OPTION_CONSTRUCTS = [
  '\\InlineOptionsOneLine',
  '\\InlineOptions',
  '\\begin{choices}',
  '\\begin{msqchoices}',
  '\\Option'
];

function optionsFollowClosingBrace(text, fromIndex) {
  let pos = fromIndex;
  while (pos < text.length && /\s/.test(text[pos])) {
    pos += 1;
  }
  return OPTION_CONSTRUCTS.some((construct) => text.startsWith(construct, pos));
}

// adapter: { argMap: string[6], resolveImagePath(rawSrc, context) -> string }
// fileContext: extra fields merged into the mutable parse context (e.g. chapterFolder)
function parseQuestions(tex, adapter, fileContext = {}) {
  const { argMap, resolveImagePath } = adapter;
  const cleaned = stripComments(tex);
  const context = { chapterFolder: '', contentLossCommands: new Map(), pendingCommonData: null, ...fileContext };
  const questions = [];
  const warnings = [];
  let i = 0;

  while (i < cleaned.length) {
    if (cleaned.startsWith('\\\\', i)) {
      i += 2;
      continue;
    }
    if (cleaned[i] === '\\' && cleaned[i + 1] !== undefined && !/[A-Za-z*]/.test(cleaned[i + 1])) {
      // Escaped literal character (\%, \&, ...) between questions — not a command.
      i += 2;
      continue;
    }
    if (cleaned[i] !== '\\') {
      i += 1;
      continue;
    }
    const parsed = parseCommandArguments(cleaned, i);
    const { command, args, nextIndex } = parsed;
    const { base: commandBase, starred } = splitStar(command);

    if (QUESTION_COMMANDS.includes(commandBase)) {
      const raw = cleaned.slice(i, Math.min(nextIndex, i + 240));
      let skipToIndex = nextIndex;
      try {
        // Positional field mapping must ignore any [optional] argument, which
        // would otherwise shift every field by one.
        const positional = bracedArgs(parsed);
        if (positional.length < 6) {
          // Malformed macro (e.g. a missing brace pair). We don't try to
          // guess its intended structure — just report it and move on.
          throw new Error(`Expected 6 arguments for \\${command}, got ${positional.length} — question skipped, verify the source`);
        }

        const fields = {};
        argMap.forEach((field, idx) => {
          fields[field] = positional[idx];
        });

        const year = Number(String(fields.year).trim());
        const questionNum = Number(String(fields.questionNum).trim());
        if (!Number.isFinite(year) || !Number.isFinite(questionNum)) {
          throw new Error(
            `Non-numeric year/questionNum (year=${fields.year}, questionNum=${fields.questionNum})`
          );
        }

        // Doc-specified ID: Q[primary field].[2-digit year].[qno], e.g. 1.26.3
        // for chapter-based subjects, or GA.21.3 for the subject-code-first
        // Aptitude layout — same rule, first argMap field stands in for
        // "chapter". Computed up front so every warning below can carry it,
        // which is what makes the exported warning list sortable per question.
        // Adapters may normalise the prefix when a subject's repos disagree on
        // how they write it (see aptitude's GA vs 1).
        const primaryField = adapter.questionIdPrefix ? adapter.questionIdPrefix(fields) : fields[argMap[0]];
        const yearTwoDigit = String(year).slice(-2).padStart(2, '0');
        const questionId = `${primaryField}.${yearTwoDigit}.${questionNum}`;

        if (positional.length > 6) {
          // Content is always the last argument authors write; a stray extra
          // (often an empty {}) tends to land before it, not after — so trust
          // the tail over strict position 5 rather than losing the question text.
          fields.content = positional[positional.length - 1];
          warnings.push({
            command,
            questionId,
            message: `Expected 6 arguments for \\${command}, got ${positional.length} — used the last argument as content; verify by hand`,
            raw,
            excluded: false
          });
        }

        if ('marks' in fields) {
          const marksNum = Number(String(fields.marks).trim());
          if (!Number.isFinite(marksNum)) {
            warnings.push({
              command,
              questionId,
              message: `'marks' argument ("${fields.marks}") is non-numeric — answer/marks arguments may be swapped`,
              raw,
              excluded: false
            });
          }
        }

        // Track content-loss commands/environments found while parsing THIS
        // question's own content separately from the file-wide tally, so we
        // can tell whether this specific question is incomplete.
        const outerContentLoss = context.contentLossCommands;
        context.contentLossCommands = new Map();
        const { body, options } = parseInlineContent(fields.content || '', context, resolveImagePath);
        const ownContentLoss = context.contentLossCommands;
        context.contentLossCommands = outerContentLoss;

        const commonData = context.pendingCommonData;
        const commonDataIncomplete = Boolean(commonData && commonData.incomplete);
        // An MCQ/MSQ is defined by its options — zero extracted options means
        // the source used some option format we don't recognize (e.g. a bare
        // \begin{enumerate}[label=\Alph*)] list instead of \begin{choices}),
        // not that the question genuinely has none. Safety net for any such
        // gap, known or not yet discovered.
        const missingOptions = commandBase !== 'NAT' && options.length === 0;

        if (ownContentLoss.size > 0 || commonDataIncomplete || missingOptions) {
          // An incomplete question (missing a table, figure, tikz diagram,
          // or its options) is worse than no question at all — don't show
          // it, just warn.
          if (ownContentLoss.size > 0) {
            const cmds = Array.from(ownContentLoss.keys())
              .map((c) => `\\${c}`)
              .join(', ');
            warnings.push({
              command,
              questionId,
              message: `Question ${questionId} excluded — contains content that cannot be rendered (${cmds}); fix the source and re-sync`,
              raw,
              excluded: true
            });
          } else if (commonDataIncomplete) {
            warnings.push({
              command,
              questionId,
              message: `Question ${questionId} excluded — its linked \\CommonData block contains unsupported content`,
              raw,
              excluded: true
            });
          } else if (optionsFollowClosingBrace(cleaned, nextIndex)) {
            warnings.push({
              command,
              questionId,
              message: `Question ${questionId} excluded — its options are written AFTER the closing brace of \\${command}{...}, so they belong to no question; move the closing brace to below the options`,
              raw: cleaned.slice(i, Math.min(cleaned.length, nextIndex + 160)),
              excluded: true
            });
          } else {
            warnings.push({
              command,
              questionId,
              message: `Question ${questionId} excluded — no options were extracted; the option markup is missing or in an unrecognized format (expected \\InlineOptions/\\InlineOptionsOneLine or \\begin{choices})`,
              raw,
              excluded: true
            });
          }
        } else {
          questions.push({
            ordinal: questions.length + 1,
            questionType: commandBase,
            starred,
            questionId,
            commonData,
            ...fields,
            year,
            questionNum,
            body,
            options,
            latex: fields.content || ''
          });
        }
      } catch (error) {
        warnings.push({ command, message: error.message, raw, excluded: true });
        if (args.length < 6) {
          // Its un-braced tail (question text, \Option/\QuestionFigure calls,
          // ...) isn't real top-level content — skip past it to the next
          // command we can actually parse instead of re-scanning it as if
          // it were, which would flood the warnings with every macro inside.
          skipToIndex = findNextTopLevelCommand(cleaned, nextIndex);
        }
      }
      i = skipToIndex;
      continue;
    }

    if (commandBase === 'YearSession') {
      if (args[0]) {
        context.chapterFolder = args[0].replace(/\\/g, '/');
      }
      i = nextIndex;
      continue;
    }

    if (commandBase === 'ChapterDivider') {
      // New chapter splash — any common-data block from a previous chapter
      // in this file no longer applies.
      context.pendingCommonData = null;
      i = nextIndex;
      continue;
    }

    if (commandBase === 'CommonData') {
      const outerContentLoss = context.contentLossCommands;
      context.contentLossCommands = new Map();
      const { body } = parseInlineContent(args[0] || '', context, resolveImagePath);
      const commonDataContentLoss = context.contentLossCommands;
      context.contentLossCommands = outerContentLoss;

      // An empty \CommonData{} is how an author clears a previously-set block.
      if (body.length > 0) {
        const incomplete = commonDataContentLoss.size > 0;
        context.pendingCommonData = { body, incomplete };
        if (incomplete) {
          const cmds = Array.from(commonDataContentLoss.keys())
            .map((c) => `\\${c}`)
            .join(', ');
          warnings.push({
            command: 'CommonData',
            message: `\\CommonData contains content that cannot be rendered (${cmds}) — every question using it will be excluded until fixed`,
            raw: cleaned.slice(i, Math.min(nextIndex, i + 200)),
            excluded: true
          });
        }
      } else {
        context.pendingCommonData = null;
      }
      i = nextIndex;
      continue;
    }

    if (commandBase === 'EndChapter') {
      i = nextIndex;
      continue;
    }

    // Anything between/before questions (\noindent, \centering, stray
    // formatting, ...) has no question to attach to anyway — nothing to
    // warn about or exclude, just move on.
    i = nextIndex;
  }

  for (const [command, info] of context.contentLossCommands.entries()) {
    warnings.push({
      command,
      message: `\\${command} encountered ${info.count} time(s) outside any question — content not rendered; verify`,
      raw: info.raw,
      excluded: true
    });
  }

  return { questions, warnings };
}

module.exports = {
  stripComments,
  collapseWhitespace,
  readBracedArgument,
  readOptionalArgument,
  readCommand,
  parseCommandArguments,
  parseInlineContent,
  parseQuestions,
  findCommandInvocations,
  unescapeLatexText,
  parseSolutions,
  QUESTION_COMMANDS,
  SOLUTION_COMMANDS
};
