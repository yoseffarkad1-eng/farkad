// tests/gate-open.matrix.mjs
//
// EVERY EXISTING SUITE, RUN AS A PHONE WITH THE PAY BOOK ON WOULD RUN IT - and the
// differences compared with a list a person keeps (tests/gate-open.expected.mjs).
//
//     npm run test:gate-open                 # the whole matrix: node suites, then browser suites
//     npm run test:gate-open -- --node       # one half
//     npm run test:gate-open -- --browser
//     npm run test:gate-open -- --only=test:finance,test:smoke
//     npm run test:gate-open -- --jobs=3     # node suites at a time (browser suites run one at a time)
//     npm run test:gate-open -- --print      # what was observed, as the list would hold it
//
// IN NO GATE, on purpose. The gates run the build as it ships, where `paybook`, `months`
// and `cold` are false. This runs the same suites with the three opened through the test
// seam (tests/gate-open.preload.mjs) and answers one question: WHICH GUARANTEES THE
// EXISTING SUITES HOLD ARE DIFFERENT ONCE THE PAY BOOK IS ON. Every difference has been
// read and is in the expected list with its reason - "the old closure dialog is replaced;
// the new screen's suite holds the same guarantee" - or it was a defect and was fixed.
//
// It exits 0 only when what it observed IS the list, both ways:
//   - a check that fails and is not on the list is a NEW difference: somebody reads it;
//   - a check on the list that now passes means the list is stale: somebody takes it off.
// A suite that dies before its last line is compared by where it died.
//
// WHAT IT DOES NOT RUN, by name (SUBJECT in the expected list): the suites whose subject
// IS the gate. They open and shut it themselves, on fixtures built for each state;
// opening it under them measures nothing. And the emulator suites: they run the pay
// book's own rules and builds already, in the release gate.
//
// THE SEAM IS NOT THE ACTIVATION. A record turned on from the app holds its opening
// (pay.po_open); a device opened through the seam has the flags and whatever record its
// suite built, usually with no opening - so the «מקדמות» tab under this instrument is the
// first-run card, not the accounts list. The activated record itself is measured, on the
// build as it ships, in tests/activation.test.mjs and tests/activation.browser.mjs.

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED, SUBJECT } from './gate-open.expected.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = (name, fallback) => {
    const found = args.filter(arg => arg.indexOf(`--${name}=`) === 0)[0];
    return found ? found.slice(name.length + 3) : fallback;
};
const chain = name => pkg.scripts[name].split('&&').map(part => part.trim().replace(/^npm run (-s )?/, ''));
const NODE = chain('test');
const BROWSER = chain('test:all').filter(name => name !== 'test');
const only = value('only', '').split(',').filter(Boolean);
const jobs = Math.max(1, Number(value('jobs', '3')) || 3);
const logs = value('logs', '');
if (logs) mkdirSync(logs, { recursive: true });

// A script is run as it is written, with the preload added to every `node` in it.
const commandOf = name => pkg.scripts[name].replace(/\bnode /g, 'node --import ./tests/gate-open.preload.mjs ');

function run(name, timeoutMs) {
    return new Promise(resolve => {
        const child = spawn('bash', ['-c', commandOf(name)], { cwd: ROOT, env: process.env });
        let out = '';
        const take = chunk => { out += chunk.toString('utf8'); };
        child.stdout.on('data', take);
        child.stderr.on('data', take);
        const timer = setTimeout(() => { out += '\n[gate-open.matrix: stopped after its time limit]\n'; child.kill('SIGKILL'); }, timeoutMs);
        child.on('close', code => {
            clearTimeout(timer);
            if (logs) writeFileSync(join(logs, name.replace(/[^\w.-]/g, '_') + '.log'), out);
            resolve({ name, code, out });
        });
    });
}

// What a run said: the checks that failed, in order, and - if it never reached its last
// line - the line it died on, with everything that varies between runs taken out.
function observed(result) {
    const lines = result.out.split('\n');
    const fails = lines.filter(line => line.indexOf('**FAIL**') === 0)
        .map(line => line.slice('**FAIL**'.length).split('  — ')[0].trim());
    const finished = /\d+\/\d+ checks passed/.test(result.out);
    let died = null;
    if (!finished) {
        const setup = lines.filter(line => line.indexOf('SETUP FAILED:') === 0)[0];
        const thrown = lines.filter(line => /^(\w*Error|locator\.\w+|page\.\w+|TimeoutError)\b.*:/.test(line.trim()))[0];
        died = (setup || thrown || 'ended without a result').trim()
            .split('  — ')[0].replace(/\d+ms/g, 'Nms').slice(0, 160);
    }
    return { fails: [...new Set(fails)], died, code: result.code };
}

async function pool(names, size, timeoutMs) {
    const results = {};
    const queue = names.slice();
    await Promise.all(Array.from({ length: size }, async () => {
        while (queue.length > 0) {
            const name = queue.shift();
            const result = await run(name, timeoutMs);
            results[name] = observed(result);
            const seen = results[name];
            process.stdout.write(`  ${seen.died ? 'DIED ' : (seen.fails.length ? 'DIFF ' : 'same ')} ${name}`
                + `${seen.fails.length ? `  (${seen.fails.length})` : ''}${seen.died ? `  ${seen.died}` : ''}\n`);
        }
    }));
    return results;
}

const wanted = list => list.filter(name => SUBJECT[name] === undefined)
    .filter(name => only.length === 0 || only.includes(name));
const skipped = NODE.concat(BROWSER).filter(name => SUBJECT[name] !== undefined);

const results = {};
if (!flag('browser')) {
    console.log(`\nnode suites, the gates open (${wanted(NODE).length}), ${jobs} at a time`);
    Object.assign(results, await pool(wanted(NODE), jobs, 30 * 60 * 1000));
}
if (!flag('node')) {
    console.log(`\nbrowser suites, the gates open (${wanted(BROWSER).length}), one at a time`);
    Object.assign(results, await pool(wanted(BROWSER), 1, 40 * 60 * 1000));
}

if (flag('print')) {
    const differing = {};
    Object.keys(results).forEach(name => {
        if (results[name].fails.length > 0 || results[name].died) differing[name] = { fails: results[name].fails, died: results[name].died };
    });
    console.log('\nobserved:\n' + JSON.stringify(differing, null, 2));
}

// ---------------------------------------------------------------- the comparison
const problems = [];
Object.keys(results).forEach(name => {
    const seen = results[name];
    const want = EXPECTED[name] || { fails: [], died: null };
    const wantFails = want.fails || [];
    // A suite that died is compared by where it died: the checks after that point never ran.
    if ((want.died || null) !== (seen.died || null)) {
        if (seen.died && !want.died) problems.push(`${name}: NEW - it died: ${seen.died}`);
        else if (!seen.died && want.died) problems.push(`${name}: STALE - the list says it dies («${want.died}») and it ran to the end`);
        else problems.push(`${name}: it died somewhere else - list: «${want.died}», now: «${seen.died}»`);
    }
    seen.fails.filter(check => !wantFails.includes(check)).forEach(check => problems.push(`${name}: NEW - ${check}`));
    if (!seen.died) wantFails.filter(check => !seen.fails.includes(check)).forEach(check => problems.push(`${name}: STALE - on the list and passing: ${check}`));
});
if (only.length === 0 && !flag('node') && !flag('browser')) {
    Object.keys(EXPECTED).filter(name => results[name] === undefined && SUBJECT[name] === undefined)
        .forEach(name => problems.push(`${name}: on the list and not a suite of either chain`));
    Object.keys(SUBJECT).filter(name => !NODE.concat(BROWSER).includes(name))
        .forEach(name => problems.push(`${name}: named as a suite about the gate and not a suite of either chain`));
}

const ran = Object.keys(results);
const same = ran.filter(name => results[name].fails.length === 0 && !results[name].died);
const differ = ran.filter(name => !same.includes(name));
console.log(`\n${ran.length} suites run with the gates open: ${same.length} say exactly what they say shut, ${differ.length} differ`
    + ` (${differ.reduce((sum, name) => sum + results[name].fails.length, 0)} checks, ${differ.filter(name => results[name].died).length} died).`);
console.log(`${skipped.length} not run - their subject is the gate: ${skipped.join(', ')}`);
if (problems.length > 0) {
    console.log(`\n**NOT THE LIST** (${problems.length}):`);
    problems.forEach(line => console.log('  ' + line));
    process.exit(1);
}
console.log('\nwhat differs is exactly tests/gate-open.expected.mjs: nothing new, nothing stale.');
process.exit(0);
