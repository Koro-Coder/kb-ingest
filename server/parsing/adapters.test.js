const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseQuestions, parseSolutions } = require('./texTokenizer');
const maths = require('./adapters/maths');
const technical = require('./adapters/technical');
const aptitude = require('./adapters/aptitude');

const fixture = (name) => fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');

test('maths adapter parses chapter-branch questions with repo-root image paths', () => {
  const tex = fixture('maths_ce.tex');
  const { questions, warnings } = parseQuestions(tex, maths, { chapterFolder: 'chapters/ch7_numerical_methods' });

  // This fixture has real \begin{tabular}/\hline/\rowcolor/\color table markup,
  // which now renders as a table node rather than excluding the question.
  assert.equal(warnings.length, 0, 'renderable tables must not produce warnings');
  assert.ok(questions.length >= 10);
  assert.ok(
    questions.some((q) => q.body.some((n) => n.type === 'table')),
    'the table-bearing questions should now be present, with a table node'
  );

  const first = questions[0];
  assert.equal(first.questionType, 'NAT');
  assert.equal(first.chapterNum, '7');
  assert.equal(first.year, 2026);
  assert.equal(first.questionNum, 1);
  assert.equal(first.marks, '2');
  assert.equal(first.answer, '0.55-0.58');
  assert.equal(first.questionId, '7.26.1');
  assert.equal(first.starred, false);
  assert.equal(first.commonData, null);

  const withImage = questions.find((q) => q.body.some((n) => n.type === 'image'));
  assert.ok(withImage, 'expected at least one question with an image body node');
  const imageNode = withImage.body.find((n) => n.type === 'image');
  assert.equal(imageNode.src, 'chapters/ch7_numerical_methods/img/CE/Q5_23.jpg');
});

test('technical adapter parses chapter-file questions with repo-root image paths', () => {
  const tex = fixture('tech_ee_ch1.tex');
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0);
  assert.ok(questions.length >= 30);

  const first = questions[0];
  assert.equal(first.questionType, 'MCQ');
  assert.equal(first.chapterNum, '1');
  assert.equal(first.year, 2026);
  assert.equal(first.questionNum, 1);
  assert.equal(first.marks, '1');
  assert.equal(first.answer, 'A');
  assert.equal(first.questionId, '1.26.1');
  const imageNode = first.body.find((n) => n.type === 'image');
  assert.equal(imageNode.src, 'img/ch1_basic_concepts_of_networks/Q1_26_1.png');
});

test('technical adapter flags the known malformed Machines_EE questions instead of crashing', () => {
  const tex = fixture('machines_ch1.tex');
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.ok(questions.length > 10, 'most questions in the file should still parse');

  const swappedWarning = warnings.find((w) => w.message.includes('may be swapped'));
  assert.ok(swappedWarning, 'expected a warning about the swapped answer/marks arguments');

  const extraArgWarning = warnings.find((w) => w.message.includes('got 7'));
  assert.ok(extraArgWarning, 'expected a warning about the extra empty argument before content');

  // The swapped-args question should still be present and renderable.
  const swapped = questions.find((q) => q.year === 2025 && q.questionNum === 1);
  assert.ok(swapped, 'the swapped-args question should still be included, just flagged');
  assert.ok(swapped.body.length > 0);
});

test('escaped percent signs are not mistaken for LaTeX comments', () => {
  const tex = String.raw`\MCQ{GA}{2021}{3}{1}{C}{In a company, 35\% of the employees drink coffee, 40\% of the employees drink tea and 10\% of the employees drink both tea and coffee. What \% of employees drink neither tea nor coffee?
\InlineOptionsOneLine{15}{20}{25}{35}}`;
  const { questions, warnings } = parseQuestions(tex, aptitude, { chapterFolder: '2021/Session1' });

  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 1);
  const text = questions[0].body.map((n) => n.value).join(' ');
  assert.match(text, /35% of the employees drink coffee/);
  assert.match(text, /What % of employees drink neither/);
  assert.equal(questions[0].options.length, 4);
});

test('a real (unescaped) % still starts a LaTeX comment', () => {
  const tex = String.raw`\MCQ{GA}{2021}{1}{1}{A}{Visible text % this is a comment and should vanish
more visible text\InlineOptionsOneLine{A}{B}{C}{D}}`;
  const { questions } = parseQuestions(tex, aptitude, { chapterFolder: '2021/Session1' });
  const text = questions[0].body.map((n) => n.value).join(' ');
  assert.match(text, /Visible text/);
  assert.doesNotMatch(text, /this is a comment/);
});

test('starred question variants are recognized and flagged, with marks hidden by convention', () => {
  const tex = String.raw`\MCQ*{1}{2024}{1}{0}{B}{
A starred practice question.
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });
  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].questionType, 'MCQ');
  assert.equal(questions[0].starred, true);
  assert.equal(questions[0].questionId, '1.24.1');
});

test('\\CommonData attaches to all following questions until cleared', () => {
  const tex = String.raw`\CommonData{
A resistor network has $R_1 = 2\,\Omega$.
}
\MCQ{1}{2024}{1}{1}{B}{
First linked question.
\InlineOptionsOneLine{A}{B}{C}{D}
}
\MCQ{1}{2024}{2}{1}{A}{
Second linked question.
\InlineOptionsOneLine{A}{B}{C}{D}
}
\CommonData{}
\MCQ{1}{2024}{3}{1}{C}{
Unrelated question.
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });
  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 3);
  assert.ok(questions[0].commonData, 'first linked question should carry the common data');
  assert.ok(questions[0].commonData.body.some((n) => n.type === 'math' && n.value.includes('R_1')));
  assert.ok(questions[1].commonData, 'second linked question should carry the same common data');
  assert.equal(questions[2].commonData, null, 'an empty \\CommonData{} should clear it for later questions');
});

test('\\(...\\) inline math is recognized, so real math commands inside it (e.g. \\overline) are not flagged unsupported', () => {
  const tex = String.raw`\MCQ{1}{1995}{2}{1}{A}{
The minimum number of NAND gates required to implement the Boolean function\(
A + A\overline{B} + \overline{A}BC,
\) is equal to
\InlineOptionsOneLine{zero}{$1$}{$4$}{$7$}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 1);
  const mathNode = questions[0].body.find((n) => n.type === 'math');
  assert.ok(mathNode, 'expected the \\(...\\) span to become a math node');
  assert.match(mathNode.value, /\\overline\{B\}/);
});

test('questions linked to a \\CommonData block with unsupported content are excluded too', () => {
  // A tikz diagram is genuinely unrenderable (unlike a table, which we now
  // render), so it still makes the whole common-data block incomplete.
  const tex = String.raw`\CommonData{
Shared context with a diagram. \begin{tikzpicture} \draw (0,0) -- (1,1); \end{tikzpicture}
}
\MCQ{1}{2024}{1}{1}{B}{
First linked question — depends on the broken common data above.
\InlineOptionsOneLine{A}{B}{C}{D}
}
\MCQ{1}{2024}{2}{1}{A}{
Second linked question — same common data.
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(questions.length, 0, 'both questions depend on the incomplete common data and must be excluded');
  const commonDataWarning = warnings.find((w) => w.command === 'CommonData');
  assert.ok(commonDataWarning, 'expected a warning naming the CommonData block itself');
  const questionWarnings = warnings.filter((w) => w.message.includes('excluded') && w.message.includes('CommonData block'));
  assert.equal(questionWarnings.length, 2, 'each excluded question should get its own warning');
});

test('\\[...\\] display math is bounded by its own \\], not the next stray \\[', () => {
  // Regression: readBracedArgument used to only clear inMath on a SECOND \[
  // rather than on \], so a question containing \[...\] would swallow
  // everything up to the next question's own \[ (or the whole rest of the
  // file), merging two unrelated questions into one.
  const tex = String.raw`\MCQ{3}{2006}{2}{2}{D}{
First question with a display equation \[ x + y = z \] and more text.
\InlineOptionsOneLine{A}{B}{C}{D}
}
\MCQ{3}{2005}{1}{1}{C}{
Second question, unrelated, also has \[ a - b \] display math.
\InlineOptionsOneLine{W}{X}{Y}{Z}
}`;
  const { questions, warnings } = parseQuestions(tex, maths, { chapterFolder: 'x' });

  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 2, 'both questions must parse separately, not merge into one');
  assert.equal(questions[0].year, 2006);
  assert.equal(questions[1].year, 2005);
  assert.equal(questions[0].options.length, 4);
  assert.equal(questions[0].options[0].value, 'A');
  assert.equal(questions[1].options[0].value, 'W');
});

// Losing this distinction is not cosmetic: KaTeX rejects \tag{} in inline mode
// and, with throwOnError:false, paints the equation's own LaTeX source on the
// page instead of rendering it. \sum / \int limits move too.
test('display and inline math are distinguished by their delimiters', () => {
  const tex = String.raw`\MCQ{3}{2006}{2}{2}{D}{
Inline $a+b$ and \(c+d\), then display $$e+f$$ and \[ g+h \].
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions } = parseQuestions(tex, maths, { chapterFolder: 'x' });
  const math = questions[0].body.filter((n) => n.type === 'math');

  const displayFor = (value) => {
    const node = math.find((n) => n.value.trim() === value);
    assert.ok(node, `expected a math node for ${value}`);
    return Boolean(node.display);
  };

  assert.equal(displayFor('a+b'), false, '$...$ is inline');
  assert.equal(displayFor('c+d'), false, '\\(...\\) is inline');
  assert.equal(displayFor('e+f'), true, '$$...$$ is display');
  assert.equal(displayFor('g+h'), true, '\\[...\\] is display');
});

test('a tagged display equation survives parsing intact', () => {
  // The real-world case: \tag{1} inside \[...\] must reach the renderer as
  // display math, or KaTeX prints "V=10-I \tag{1}" as literal red text.
  const tex = String.raw`\MCQ{3}{2006}{2}{2}{D}{
The terminal voltage is \[ V = 10 - I \tag{1} \] and the load is \[ 7I = V^2 + 2V \tag{2} \].
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions } = parseQuestions(tex, maths, { chapterFolder: 'x' });
  const math = questions[0].body.filter((n) => n.type === 'math');

  const tagged = math.filter((n) => n.value.includes('\\tag'));
  assert.equal(tagged.length, 2, 'both tagged equations should be math nodes');
  assert.ok(
    tagged.every((n) => n.display === true),
    'a \\tag equation must be display math or KaTeX refuses to render it'
  );
  assert.ok(tagged[1].value.includes('V^2'), 'the exponent must stay inside the math node');
});

test('a real-world data table renders, with styling commands stripped from cells', () => {
  // The exact question that originally surfaced this: \centering and
  // \arraybackslash are layout noise and must not leak into cell text, while
  // \textbf must unwrap to its words and $P$ must stay math.
  const tex = String.raw`\NAT{6}{2024}{13}{2}{0.04}{A company purchased components from the firms $P$, $Q$, and $R$ as shown in the table below. \begin{tabular}{|c|p{3cm}|p{3cm}|} \hline \textbf{Firm} & \centering\textbf{Total number of components purchased}\arraybackslash & \centering\textbf{Number of components likely to be defective}\arraybackslash \\ \hline $P$ & 1000 & 5 \\ \hline $Q$ & 2500 & 5 \\ \hline $R$ & 500 & 2 \\ \hline \end{tabular} The components are stored together. What is the probability that it was supplied by firm $R$?}`;
  const { questions, warnings } = parseQuestions(tex, maths, { chapterFolder: 'x' });

  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 1, 'the question must no longer be excluded');

  const table = questions[0].body.find((n) => n.type === 'table');
  assert.ok(table, 'expected a table body node');
  assert.equal(table.rows.length, 4, 'header row plus one row each for P, Q, R');

  const header = table.rows[0].map((c) => c.content.map((n) => n.value).join(''));
  assert.deepEqual(header, [
    'Firm',
    'Total number of components purchased',
    'Number of components likely to be defective'
  ]);
  assert.ok(
    !header.join(' ').includes('arraybackslash'),
    'layout commands must not leak into cell text'
  );

  const rowP = table.rows[1];
  assert.equal(rowP[0].content[0].type, 'math');
  assert.equal(rowP[0].content[0].value, 'P');
  assert.equal(rowP[1].content.map((n) => n.value).join(''), '1000');
  assert.equal(rowP[2].content.map((n) => n.value).join(''), '5');

  // The prose either side of the table must survive intact.
  const prose = questions[0].body.filter((n) => n.type === 'text').map((n) => n.value).join(' ');
  assert.match(prose, /as shown in the table below/);
  assert.match(prose, /The components are stored together/);
});

test('an MCQ/MSQ with zero extracted options is excluded rather than shown unanswerable', () => {
  // Real content sometimes uses \begin{enumerate}[label=\Alph*)] instead of
  // the documented \begin{choices}/\Option — we don't try to recognize that
  // as an options list (too easy to misclassify a genuine statement list),
  // but showing an MCQ with zero clickable options would be worse than not
  // showing it at all.
  const tex = String.raw`\MCQ{2}{2025}{1}{2}{A}{The relationship will be
\begin{enumerate}[label=\Alph*)]
\item $\dfrac{1}{2}$ option text lags
\item $\dfrac{1}{2}$ option text leads
\end{enumerate}
}
\MCQ{2}{2025}{2}{1}{B}{
A normal question with real options.
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(questions.length, 1, 'only the question with real options should be shown');
  assert.equal(questions[0].questionId, '2.25.2');

  const exclusionWarning = warnings.find((w) => w.message.includes('2.25.1') && w.message.includes('excluded'));
  assert.ok(exclusionWarning, 'expected a warning naming the zero-option question by its questionId');
  assert.match(exclusionWarning.message, /unrecognized format/);
});

test('options written after the closing brace get a precise "move the brace" diagnostic, not a format guess', () => {
  // The options here use entirely correct \begin{choices}/\Option markup —
  // they are just outside the content argument, so they belong to no
  // question. That is a different fix from an unrecognized format, and the
  // warning must say so or it sends the author hunting for the wrong thing.
  const tex = String.raw`\MCQ{2}{2009}{2}{2}{C}{With both S1 and S2 open, the core flux waveform will be}

\begin{choices}
\Option{a sinusoid at fundamental frequency}
\Option{flat-topped with third harmonic}
\end{choices}
`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(questions.length, 0);
  const w = warnings.find((x) => x.message.includes('2.09.2'));
  assert.ok(w, 'expected a warning for the question');
  assert.match(w.message, /AFTER the closing brace/);
  assert.doesNotMatch(w.message, /unrecognized format/, 'must not misdiagnose this as a format problem');
  assert.match(w.raw, /begin\{choices\}/, 'raw excerpt should show the stray options so the fix is obvious');
});

test('a bare unrecognized command outside the template vocabulary is silently dropped, its text kept, no warning/exclusion', () => {
  // \fancyunsupported isn't part of the template vocabulary and isn't math —
  // real LaTeX/KaTeX could render it, we can't, but it's not "incomplete":
  // the actual words ("stuff") are real content and must survive.
  const tex = String.raw`\MCQ{1}{2024}{1}{1}{A}{
Some text with \fancyunsupported{stuff} in it.
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0, 'a bare unknown command must not produce any warning');
  assert.equal(questions.length, 1, 'the question must not be excluded');
  const text = questions[0].body.map((n) => n.value || '').join(' ');
  assert.match(text, /stuff/, 'the unwrapped argument text must be kept');
  assert.doesNotMatch(text, /fancyunsupported/, 'the command name itself must not leak into the body');
});

test('\\includegraphics renders as an image, same as \\QuestionFigureNoNumber', () => {
  // Raw \includegraphics carries the identical (optional size, path) shape as
  // the template macro, so it is rendered rather than treated as content loss.
  const tex = String.raw`\MCQ{1}{2024}{1}{1}{A}{
Refer to the diagram. \includegraphics[width=0.35\textwidth,keepaspectratio]{img/ch2_Transformers/2_14_34.png}
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0, 'a renderable image is not a warning');
  assert.equal(questions.length, 1, 'the question must not be excluded');
  const imageNode = questions[0].body.find((n) => n.type === 'image');
  assert.ok(imageNode, 'expected an image body node');
  assert.equal(imageNode.src, 'img/ch2_Transformers/2_14_34.png');
  assert.equal(imageNode.size, 'width=0.35\\textwidth,keepaspectratio');
});

test('\\begin{figure} flows through, keeping its \\includegraphics and caption text', () => {
  const tex = String.raw`\MCQ{1}{2024}{1}{1}{A}{
See below.
\begin{figure}[h]
\centering
\includegraphics[width=0.5\textwidth]{img/diagram.png}
\caption{Circuit under test}
\end{figure}
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 1);
  const imageNode = questions[0].body.find((n) => n.type === 'image');
  assert.ok(imageNode, 'the image inside the figure must survive');
  assert.equal(imageNode.src, 'img/diagram.png');
  const text = questions[0].body.map((n) => n.value || '').join(' ');
  assert.match(text, /Circuit under test/, 'the caption text is real content and must survive');
});

test('layout-only environments (center, quote) pass their content through with no warning', () => {
  const tex = String.raw`\MCQ{1}{2024}{1}{1}{A}{
\begin{center}
Centered statement text that must survive.
\end{center}
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 1);
  const text = questions[0].body.map((n) => n.value || '').join(' ');
  assert.match(text, /Centered statement text that must survive/);
});

test('aptitude adapter resolves session-relative image paths', () => {
  const tex = String.raw`\MCQ{GA}{2021}{1}{1}{D}{The value is $\frac{a+b}{c}$ and the image is \QuestionFigure[0.35\textwidth]{img/Q5_22.png}
\InlineOptionsOneLine{A}{B}{C}{D}}`;
  const { questions, warnings } = parseQuestions(tex, aptitude, { chapterFolder: '2021/Session1' });

  assert.equal(warnings.length, 0);
  assert.equal(questions.length, 1);
  const q = questions[0];
  assert.equal(q.subjectCode, 'GA');
  assert.equal(q.session, '1');
  const imageNode = q.body.find((n) => n.type === 'image');
  assert.equal(imageNode.src, '2021/Session1/img/Q5_22.png');
  assert.equal(q.options.length, 4);
});

test('every warning carries an explicit excluded flag, correctly set per case', () => {
  const excludedCase = String.raw`\NAT{6}{2024}{1}{2}{0.5}{Text with a diagram. \begin{tikzpicture} \draw (0,0) -- (1,1); \end{tikzpicture} more text.}`;
  const { warnings: excludedWarnings } = parseQuestions(excludedCase, maths, { chapterFolder: 'x' });
  assert.ok(excludedWarnings.length > 0);
  assert.ok(excludedWarnings.every((w) => w.excluded === true));

  const keptCase = String.raw`\MCQ{6}{2024}{1}{A, D}{2}{
Content survives despite the swapped marks/answer args.
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions: keptQuestions, warnings: keptWarnings } = parseQuestions(keptCase, technical, { chapterFolder: '' });
  assert.equal(keptQuestions.length, 1, 'the question with swapped marks/answer must still be shown');
  assert.ok(keptWarnings.length > 0);
  assert.ok(keptWarnings.every((w) => w.excluded === false));
});

test('a simple tabular becomes a real table node (K-map grid preserved cell-for-cell)', () => {
  const tex = String.raw`\MCQ{2}{2006}{1}{1}{A}{
The number of product terms obtained through the following K-map is
\begin{center}
\begin{tabular}{|c|c|c|c|}
\hline
1 & 0 & 0 & 1 \\ \hline
0 & d & 0 & 0 \\ \hline
1 & 0 & 0 & 1 \\ \hline
\end{tabular}
\end{center}
\InlineOptionsOneLine{2}{3}{4}{5}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0, 'a renderable table is not a warning');
  assert.equal(questions.length, 1, 'the question must no longer be excluded');

  const table = questions[0].body.find((n) => n.type === 'table');
  assert.ok(table, 'expected a table body node');
  assert.equal(table.rows.length, 3);
  const asText = table.rows.map((r) => r.map((c) => c.content.map((n) => n.value).join('')));
  assert.deepEqual(asText, [
    ['1', '0', '0', '1'],
    ['0', 'd', '0', '0'],
    ['1', '0', '0', '1']
  ]);
  assert.ok(table.rows.every((r) => r.every((c) => c.colspan === 1)));
});

test('\\multicolumn maps to colspan, and cell contents keep their math/bold', () => {
  const tex = String.raw`\MCQ{4}{2010}{1}{2}{A}{Truth table below.
\begin{tabular}{|c|c|c|}
\hline
\multicolumn{2}{|c|}{\textbf{Inputs}} & \textbf{Out} \\ \hline
$A$ & 0 & $\dfrac{1}{2}$ \\ \hline
\end{tabular}
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0);
  const table = questions[0].body.find((n) => n.type === 'table');
  assert.ok(table);
  assert.equal(table.rows.length, 2, 'header and data row must split on the row delimiter');

  const header = table.rows[0];
  assert.equal(header.length, 2, 'the multicolumn spans two columns, so the row has 2 cells');
  assert.equal(header[0].colspan, 2);
  assert.equal(header[0].content.map((n) => n.value).join(''), 'Inputs');
  assert.equal(header[1].colspan, 1);
  assert.equal(header[1].content.map((n) => n.value).join(''), 'Out');

  const data = table.rows[1];
  assert.equal(data.length, 3);
  assert.equal(data[0].content[0].type, 'math', '$A$ must stay a math node inside the cell');
  assert.equal(data[0].content[0].value, 'A');
  assert.equal(data[2].content[0].type, 'math');
  assert.equal(data[2].content[0].value, '\\dfrac{1}{2}');
});

test('a nested tabular is still excluded, since the flat row/cell model cannot express it', () => {
  const tex = String.raw`\MCQ{1}{2010}{1}{1}{A}{Outer.
\begin{tabular}{|c|}
\hline
\begin{tabular}{|c|} \hline x \\ \hline \end{tabular} \\ \hline
\end{tabular}
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });

  assert.equal(questions.length, 0);
  assert.ok(warnings.some((w) => w.message.includes('begin{tabular}') && w.excluded === true));
});

test('an [optional] argument is never mistaken for content in any positional macro', () => {
  // Regression: \InlineOptions[1em]{...} is real in the source repos. Counting
  // the optional spacing arg as option (A) shifted every real option down one,
  // so all four answer labels rendered wrong — silently, with no warning.
  const spaced = String.raw`\MCQ{5}{2012}{1}{2}{A}{The voltage is
\InlineOptions[1em]{(10+j0)V}{(100+j0)V}{(0+j100)V}{(0-j100)V}
}`;
  const { questions, warnings } = parseQuestions(spaced, technical, { chapterFolder: '' });
  assert.equal(warnings.length, 0);
  assert.equal(questions[0].options.length, 4, 'the spacing argument must not become an option');
  assert.deepEqual(
    questions[0].options.map((o) => o.value),
    ['(10+j0)V', '(100+j0)V', '(0+j100)V', '(0-j100)V']
  );

  // Same hazard on the question macro itself: an optional arg must not shift
  // the six positional fields.
  const optOnMacro = String.raw`\MCQ[h]{1}{2024}{7}{2}{B}{Stem.
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions: q2 } = parseQuestions(optOnMacro, technical, { chapterFolder: '' });
  assert.equal(q2.length, 1);
  assert.equal(q2[0].questionId, '1.24.7');
  assert.equal(q2[0].year, 2024);
  assert.equal(q2[0].answer, 'B');

  // And on figures, where the optional arg is the size, not the path.
  const fig = String.raw`\MCQ{1}{2024}{1}{1}{A}{See figure.
\QuestionFigure[0.5\textwidth]{img/x.png}
\InlineOptionsOneLine{A}{B}{C}{D}
}`;
  const { questions: q3 } = parseQuestions(fig, technical, { chapterFolder: '' });
  const image = q3[0].body.find((n) => n.type === 'image');
  assert.equal(image.src, 'img/x.png');
  assert.equal(image.size, '0.5\\textwidth');
});

test('every documented option style is recognized, with no warning', () => {
  // Guards the full option vocabulary in one place: a regression in any of
  // these silently hides questions behind a "no options were extracted"
  // warning, which reads as an authoring fault rather than a parser bug.
  const styles = {
    InlineOptionsOneLine: String.raw`\MCQ{1}{2024}{1}{1}{A}{Stem.
\InlineOptionsOneLine{A}{B}{C}{D}
}`,
    InlineOptions: String.raw`\MCQ{1}{2024}{1}{1}{A}{Stem.
\InlineOptions{A}{B}{C}{D}
}`,
    'choices + Option': String.raw`\MCQ{1}{2024}{1}{1}{A}{Stem.
\begin{choices}
\Option{A}
\Option{B}
\Option{C}
\Option{D}
\end{choices}
}`,
    'msqchoices + Option': String.raw`\MSQ{1}{2024}{1}{1}{A,C}{Stem.
\begin{msqchoices}
\Option{A}
\Option{B}
\Option{C}
\Option{D}
\end{msqchoices}
}`,
    'image options': String.raw`\MCQ{1}{2024}{1}{1}{A}{Stem.
\begin{choices}
\Option{\QuestionFigureNoNumber[width=0.3\columnwidth]{img/a.png}}
\Option{\QuestionFigureNoNumber[width=0.3\columnwidth]{img/b.png}}
\Option{\QuestionFigureNoNumber[width=0.3\columnwidth]{img/c.png}}
\Option{\QuestionFigureNoNumber[width=0.3\columnwidth]{img/d.png}}
\end{choices}
}`
  };

  for (const [styleName, tex] of Object.entries(styles)) {
    const { questions, warnings } = parseQuestions(tex, technical, { chapterFolder: '' });
    assert.equal(warnings.length, 0, `${styleName}: expected no warnings, got ${JSON.stringify(warnings)}`);
    assert.equal(questions.length, 1, `${styleName}: the question must be kept`);
    assert.equal(questions[0].options.length, 4, `${styleName}: expected 4 options`);
  }

  // The image-option style must also capture the image per option.
  const { questions: imageQuestions } = parseQuestions(styles['image options'], technical, { chapterFolder: '' });
  assert.equal(imageQuestions[0].options[0].images.length, 1);
  assert.equal(imageQuestions[0].options[0].images[0].src, 'img/a.png');
});

test('chapter-based solutions use the documented 8-argument spine', () => {
  const tex = String.raw`\MCQSol{1}{2023}{4}{2}{A}{3}{https://youtu.be/v1}{
Use series-parallel reduction.
\[ R_{eq} = 4\,\Omega \]
\[ \boxed{4\,\Omega} \]
\KeyPoints{
\begin{itemize}
  \item Parallel: product-over-sum.
  \item Series: direct summation.
\end{itemize}
}
\MistakesToAvoid{
\begin{itemize}
  \item Do not mix the formulas.
\end{itemize}
}
}`;
  const { solutions, warnings } = parseSolutions(tex, technical, { chapterFolder: '' });

  assert.equal(warnings.length, 0);
  assert.equal(solutions.length, 1);
  const s = solutions[0];
  assert.equal(s.solutionType, 'MCQSol');
  assert.equal(s.questionNum, 4);
  assert.equal(s.year, 2023);
  assert.equal(s.marks, '2');
  assert.equal(s.answer, 'A');
  assert.equal(s.difficulty, '3');
  assert.equal(s.video, 'https://youtu.be/v1');

  const keypoints = s.body.find((n) => n.type === 'keypoints');
  assert.ok(keypoints, 'expected a Key Points block');
  const kpList = keypoints.content.find((n) => n.type === 'list');
  assert.ok(kpList, 'Key Points must keep its list structure, not flatten to prose');
  assert.equal(kpList.items.length, 2);

  const mistakes = s.body.find((n) => n.type === 'mistakes');
  assert.ok(mistakes, 'expected a Mistakes to Avoid block');
});

test('aptitude solutions use the 7-argument form (no chapter) and resolve session-relative figures', () => {
  const tex = String.raw`\MCQSol{2021}{2}{1}{B}{2}{}{%
Reflect the word across the x-axis.
\SolutionFigure[0.3\textwidth]{img/Q2_21.png}
\[ \boxed{\text{B}} \]
}`;
  const { solutions, warnings } = parseSolutions(tex, aptitude, { chapterFolder: '2021/Session1' });

  assert.equal(warnings.length, 0);
  assert.equal(solutions.length, 1);
  const s = solutions[0];
  assert.equal(s.year, 2021, 'year is the FIRST argument for aptitude, not the second');
  assert.equal(s.questionNum, 2);
  assert.equal(s.marks, '1');
  assert.equal(s.answer, 'B');
  assert.equal(s.difficulty, '2');
  assert.equal(s.video, '');

  const image = s.body.find((n) => n.type === 'image');
  assert.ok(image, '\\SolutionFigure must become an image node');
  assert.equal(image.src, '2021/Session1/img/Q2_21.png');
});

test('\\Method blocks are kept as separate labelled sections', () => {
  const tex = String.raw`\MCQSol{1}{2020}{11}{1}{B}{2}{}{
\Method{1}{\[ I = \frac{10}{5} = 2 \]}
\Method{2}{\[ I = \frac{P}{V} = 2 \]}
\[ \boxed{2\,\text{A}} \]
}`;
  const { solutions } = parseSolutions(tex, technical, { chapterFolder: '' });
  const methods = solutions[0].body.filter((n) => n.type === 'method');
  assert.equal(methods.length, 2);
  assert.deepEqual(methods.map((m) => m.label), ['1', '2']);
});

test('each adapter offers the right mirrored solution-file candidates', () => {
  assert.ok(aptitude.solutionPathCandidates('2021/Session1/common.tex').includes('2021/Session1/sol.tex'));
  assert.ok(
    maths
      .solutionPathCandidates('chapters/ch7_numerical_methods/ce.tex')
      .includes('chapters/ch7_numerical_methods/sol_CE.tex')
  );

  // Technical repos disagree on the suffix, so BOTH forms must be offered:
  // Network Theory EE appends "_solutions", Machines EE / Digital EC do not.
  const technicalCandidates = technical.solutionPathCandidates('chapters/ch1_Magnetic_circuits.tex');
  assert.ok(technicalCandidates.includes('solutions/ch1_Magnetic_circuits_solutions.tex'));
  assert.ok(technicalCandidates.includes('solutions/ch1_Magnetic_circuits.tex'));

  assert.deepEqual(
    aptitude.solutionPathCandidates('frontmatter/preface.tex'),
    [],
    'non-question files have no solution'
  );
});

test('solutions must be joined on year AND question number, not number alone', () => {
  // A chapter file spans many years and restarts numbering each year, so Q1
  // exists once per year. Matching on questionNum alone silently returns the
  // wrong year's solution.
  const tex = String.raw`\MCQSol{1}{2025}{1}{2}{A,D}{2}{}{Solution for 2025 Q1. \[ \boxed{AD} \]}
\MCQSol{1}{2021}{1}{1}{A}{1}{}{Solution for 2021 Q1. \[ \boxed{A} \]}`;
  const { solutions } = parseSolutions(tex, technical, { chapterFolder: '' });

  assert.equal(solutions.length, 2);
  assert.ok(
    solutions.every((s) => s.questionNum === 1),
    'both solutions share question number 1 — only the year separates them'
  );

  const for2021 = solutions.find((s) => s.questionNum === 1 && s.year === 2021);
  const for2025 = solutions.find((s) => s.questionNum === 1 && s.year === 2025);
  assert.equal(for2021.answer, 'A');
  assert.equal(for2025.answer, 'A,D');
});

test('aptitude question ids normalise the subject code to a chapter number', () => {
  // The 2021-2026 repos write \MCQ{GA}{...}; the 2010-2014 repos write
  // \MCQ{1}{...}. Both must print as 1.YY.n so ids are consistent everywhere.
  const gaStyle = String.raw`\MCQ{GA}{2021}{1}{1}{D}{Question text.\InlineOptionsOneLine{A}{B}{C}{D}}`;
  const numericStyle = String.raw`\MCQ{1}{2014}{3}{1}{A}{Question text.\InlineOptionsOneLine{A}{B}{C}{D}}`;

  const { questions: ga } = parseQuestions(gaStyle, aptitude, { chapterFolder: '2021/Session1' });
  const { questions: numeric } = parseQuestions(numericStyle, aptitude, { chapterFolder: '2014/Session1' });

  assert.equal(ga[0].questionId, '1.21.1');
  assert.equal(numeric[0].questionId, '1.14.3');
});
