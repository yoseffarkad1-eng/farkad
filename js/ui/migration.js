// What the migration could not decide, put in front of the person who can.
//
// The old data has cells like "הרצליה + תל אביב" with no consistent separator, so the
// migration refuses to guess. Every unresolved cell lands here with its original text
// intact, and stays until someone chooses. Nothing is silently dropped and nothing is
// silently invented - a wrong guess here would become a wrong day in someone's pay.

function renderMigration() {
    const banner = document.getElementById('migrationBanner');
    if (!banner) return;

    const count = State.migrationIssues.length;
    if (count === 0) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = '';
    clear(banner);
    banner.appendChild(el('span', null, `⚠️ ${count} רישומים מהגרסה הקודמת דורשים החלטה`));
    banner.appendChild(button('פתח', 'btn-secondary', openMigrationModal));
}

function openMigrationModal() {
    renderMigrationList();
    document.getElementById('migrationModal').style.display = 'flex';
}

function closeMigrationModal() {
    document.getElementById('migrationModal').style.display = 'none';
    render();
}

function renderMigrationList() {
    const container = document.getElementById('migrationList');
    clear(container);

    if (State.migrationIssues.length === 0) {
        container.appendChild(emptyHint('✔️ כל הרישומים טופלו.'));
        return;
    }

    State.migrationIssues.forEach(issue => {
        container.appendChild(renderIssue(issue));
    });
}

function renderIssue(issue) {
    const card = el('div', 'issue');

    card.appendChild(el('div', 'issue-value', `"${issue.value || ''}"`));

    const meta = [];
    if (issue.workerName) meta.push(issue.workerName);
    if (issue.date) meta.push(formatFullDate(parseLocalDate(issue.date)));
    if (meta.length > 0) card.appendChild(el('div', 'issue-meta', meta.join(' · ')));
    card.appendChild(el('div', 'issue-message', issue.message || ''));

    // Only offered when every part matched a real site. Still a suggestion: it is applied
    // by pressing this, never on its own.
    if (issue.suggestion && issue.workerId && issue.date) {
        const names = issue.suggestion.placeIds
            .map(id => (State.place(id) || {}).name)
            .filter(Boolean);
        if (names.length > 0) {
            card.appendChild(button(`פצל ל: ${names.join(' + ')}`, 'btn-add',
                () => applyIssueDecision(issue, issue.suggestion.placeIds)));
        }
    }

    if (issue.workerId && issue.date && State.activePlaces().length > 0) {
        const row = el('div', 'issue-places');
        row.appendChild(el('span', 'issue-label', 'או בחר אתר:'));
        State.activePlaces().forEach(place => {
            row.appendChild(button(place.name, 'place-btn',
                () => applyIssueDecision(issue, [place.id])));
        });
        card.appendChild(row);
    }

    card.appendChild(button('התעלם', 'btn-secondary', async () => {
        const go = await askConfirm({
            title: 'להתעלם מהרישום הזה?',
            message: 'הוא לא ייכלל בדוחות.',
            ok: 'התעלם'
        });
        if (!go) return;
        dismissIssue(issue);
        renderMigrationList();
    }));

    return card;
}

// A decision here writes a work day into the record, so it goes out the same way every
// other edit does. Saving alone would leave it on this phone: the day would be in one
// person's pay report and in nobody else's.
function applyIssueDecision(issue, placeIds) {
    const changes = resolveIssue(State.schedule, issue, placeIds);
    if (changes.length === 0) return;

    // A decision that could not be stored must not leave the list, or the question is
    // gone and the day it was about is not recorded anywhere.
    if (!State.commitMany(changes)) return;
    dismissIssue(issue);
    renderMigrationList();
}
