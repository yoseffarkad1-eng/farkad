// ---------------------------------------------------------------- the worker's statement
//
// Split out of js/ui/reports.js. The code is unchanged: the same two functions in the same
// order. Nothing was renamed and nothing was tidied on the way past.
//
// That split was measured at v102 and REFUSED, and the reason was never this file's size -
// it was that twenty-seven places across fourteen suites reached js/ui/reports.js off the
// disk by name rather than through tests/harness.mjs, three of them meta-tests iterating
// their own hard-coded file lists. A split that missed one would have left a suite quietly
// covering less than it claims. The harness now names this group in one place
// (REPORTS_GROUP / reportsSource in tests/harness.mjs) and every one of those reads goes
// through it, which is what made the move safe rather than merely tidy.
//
// WHAT THIS FILE OWNS: the message a worker is sent on payday - the days he worked, what
// they came to, what was already handed over, and what is left. One text, built from the
// same account reader the screen and the workbook use, and handed to the share sheet or to
// WhatsApp.
//
// WHAT IT MUST NEVER DO:
//   - do its own arithmetic. Four surfaces once priced one fortnight four ways and a man
//     could be told 1,950 on the screen and 3,050 on WhatsApp about the same evening.
//     Every figure here comes through workerAccountFor, and tests/money.display.test.mjs
//     is what holds that.
//   - write anything. A statement is a person READING an account. Nothing on this path may
//     record, settle or close - reading a fortnight must never be what seals it.
//   - name a figure something other than what it is. The words here are pinned verbatim by
//     tests/wording.test.mjs and tests/repayment.test.mjs; changing one is a product
//     decision, made deliberately, in the same commit as the test that pins it.

// The statement the worker gets on payday, in the same shape as the screen it came from:
// the days, then what they add up to, then what was already handed over. Sent the same
// way the seder is, because that is the channel these men are reachable on.
function workerStatementText(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return '';

    const days = workerDaysReport(State.schedule, worker, REPORT_RANGE.from, REPORT_RANGE.to);
    const advances = advancesFor(State.schedule, worker.id, REPORT_RANGE.from, REPORT_RANGE.to);
    const worked = days.filter(day => !day.absent);
    const earned = worked.reduce((sum, day) => sum + (day.amount || 0), 0);
    // THE SAME ACCOUNT THE SCREEN AND THE SHEET READ. This summed the advances dated in
    // the range, which is a different question from what comes off this man's wage - and
    // his own copy was the one document that answered it differently from the sheet he
    // is paid against.
    const account = workerAccountFor(worker.id);
    const taken = account
        ? account.deducted
        : advances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const priced = Number(worker.dailyRate) > 0;

    const lines = [
        `📄 ${isolate(worker.name)} - ${formatFullDate(parseLocalDate(REPORT_RANGE.from))} עד ${formatFullDate(parseLocalDate(REPORT_RANGE.to))}`,
        ''
    ];

    days.forEach(day => {
        const parsed = parseLocalDate(day.date);
        const when = `${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatShortDate(parsed)}`;
        if (day.absent) { lines.push(`• ${when} - נעדר`); return; }

        const labels = reportPlaceLabels();
        const where = day.entries.map(entry => {
            const name = placeLabelFrom(labels, entry.placeId);
            const rate = entryRate(entry);
            if (rate === RATE_DOUBLE) return `${name} (כפול)`;
            if (rate === RATE_EXTRA) {
                const hours = entryExtraHours(entry);
                return hours ? `${name} (${plusAmount(hours)} ש׳)` : `${name} (נוספות)`;
            }
            return name;
        }).join(' + ');

        lines.push(`• ${when} - ${where}${priced && day.amount !== null ? ` - ${moneyText(day.amount)}` : ''}`);
    });

    lines.push('');
    // Both numbers, in the message the man actually receives. He is the one person who
    // will check the total against the days, and one count could not explain it.
    const summary = workerDaysSummary(days);
    lines.push('סה״כ ' + countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות'));
    lines.push(workUnitsLine(summary));
    if (priced) lines.push(`נצבר: ${moneyText(agora(earned))}`);

    // The screen puts a * on unpriced hours and the sheet explains it; the message the
    // worker actually receives must not be the one place that pretends the number is
    // complete.
    if (priced && days.some(day => !day.absent && day.extraHours > 0)
        && !(Number(worker.hourlyRate) > 0)) {
        lines.push('');
        lines.push('* שעות נוספות בלי שכר שעה - לא נכללו בסכום.');
    }

    // WHAT HE OWED BEFORE THIS FORTNIGHT BEGAN. Without it the deduction below looks
    // like it came from nowhere, and the man checking his own message has no way to get
    // from the advance he remembers to the number he is handed.
    if (account && account.carriedIn > 0) {
        lines.push('');
        // יתרת פתיחה, not "ניתנה מקדמה מחשבון קודם". Nothing was given from a previous
        // account; a balance was carried out of one. The old wording said money changed
        // hands on a date it did not, in the document the man checks his own pay against.
        lines.push(`יתרת פתיחה: ${moneyText(account.carriedIn)}`);
    }

    if (advances.length > 0) {
        lines.push('');
        // What was handed over IN THIS PERIOD, totalled before the individual lines, so
        // the four figures below read as one account: opening balance, new advances,
        // what came off the wage, what is still open.
        lines.push(`מקדמות חדשות: ${moneyText(agora(advances.reduce(
            (sum, item) => sum + (Number(item.amount) || 0), 0)))}`);
        // The same three words the screen draws over the same record. The man is the one
        // person who will ever dispute "you were paid in cash", and his own copy used to
        // be the one document in the app that could not answer.
        advances.forEach(item => lines.push(
            `${advanceMethodLabel(item.method)} ${formatShortDate(parseLocalDate(item.date))}: `
            + `${minusAmount(item.amount)}`));
    }

    // Cash he handed back, and money already taken off his wage - his own copy has to
    // name both, or the two of them are the difference he cannot account for.
    if (account && account.repaid > 0) {
        lines.push(`${LEDGER_KIND_LABELS.repaid}: ${moneyText(account.repaid)}`);
    }
    if (account && account.reversed > 0) {
        lines.push(`${LEDGER_KIND_LABELS.reversed}: ${moneyText(account.reversed)}`);
        // AND WHY, and against what. An amount with no reason is the one line on this
        // message a man cannot check: it says money moved and does not say what it
        // undid. Each correction names the transaction it corrects - its kind, its date
        // and its amount - and the reason somebody typed when they wrote it.
        correctionsIn(worker.id, REPORT_RANGE.from, REPORT_RANGE.to).forEach(entry => {
            lines.push(`  · ${correctionLine(entry)}`);
        });
    }
    if (account && account.deducted > 0) {
        lines.push(`${LEDGER_KIND_LABELS.deducted}: ${moneyText(account.deducted)}`);
    }

    // AND THE ONE THING THAT STOPS A PAYMENT. The man's own copy is the document he
    // acts on, and it was the one surface that said nothing when his account did not add
    // up - a clean net, on a record where more had been handed back than was ever given.
    const overpayment = overpaymentWarning(account);
    if (overpayment) {
        lines.push('');
        lines.push(overpayment);
    }

    if (priced) {
        lines.push('');
        lines.push(`נותר לתשלום: `
            + `${bidiAmount(moneyText(agora(agora(earned) - agora(taken))))}`);
        // And what is still on the books afterwards, in the words the two labels never
        // swap: a closed period reports its יתרת סגירה, an open one its חוב פתוח.
        // BOTH FIGURES WHEN THERE ARE TWO, because there are two and he is entitled to
        // the second one. The sheet has printed both since C4; this document printed only
        // the frozen one, so a man who handed back 400 after his fortnight shut was told
        // he still owed 1,950 when he owed 1,550 - and the office's copy said so. The one
        // number he can check was the one that left out the money he paid.
        //
        // `חוב פתוח כולל` rather than `חוב פתוח`: on an open period that label means the
        // whole balance and nothing was frozen beside it. Here it stands next to a closing
        // balance and means what is left after everything that has happened since, which
        // is a different sentence and takes a different word.
        if (account && account.closed && account.carriedOut > 0) {
            lines.push(`יתרת סגירה: ${moneyText(account.carriedOut)}`);
            if (account.lateSinceClose !== 0) {
                lines.push(`חוב פתוח כולל: ${moneyText(account.carriedForward)}`);
            }
        } else if (account && account.carriedForward > 0) {
            lines.push(`חוב פתוח: ${moneyText(account.carriedForward)}`);
        }
    }

    return lines.join('\n');
}

function shareWorkerStatement(workerId) {
    const text = workerStatementText(workerId);
    if (!text) return;

    if (navigator.share) {
        navigator.share({ text }).catch(error => {
            if (error && error.name === 'AbortError') return;
            // Outside the gesture by now, so a window.open here would be popup-blocked
            // and the failure silent. Say what happened instead.
            askTell('השיתוף לא נפתח. נסה שוב, או שלח מתוך מסך היום.');
        });
        return;
    }
    // Inside the click, where the browser still allows a new tab.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
