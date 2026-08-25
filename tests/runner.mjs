// The reporting half of the data suite, kept apart from the tests so that the tests read
// as a list of claims about the app rather than as plumbing.

const results = [];
let group = '';

export function suite(name) {
    group = name;
    console.log(`\n${name}`);
}

export function check(name, pass, detail = '') {
    results.push({ group, name, pass: Boolean(pass), detail });
    console.log(`${pass ? '  PASS' : '**FAIL**'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// For a claim that is easier to state as "these two are the same thing".
export function same(name, actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    check(name, a === b, a === b ? '' : `${a} !== ${b}`);
}

// An assertion that a test itself depends on - a precondition, not a claim about the
// app. If one of these is wrong the test below it is meaningless, so it stops the run
// rather than reporting a failure that points at the wrong place.
export function given(what, condition) {
    if (!condition) {
        console.error(`\nSETUP FAILED: ${what}`);
        process.exit(2);
    }
}

export function report() {
    const failed = results.filter(r => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
        console.log('\nfailed:');
        failed.forEach(r => console.log(`  ${r.group} :: ${r.name}${r.detail ? '  — ' + r.detail : ''}`));
    }
    process.exit(failed.length ? 1 : 0);
}
