import { writeFileSync } from 'node:fs';

// Declenche `promote.yml` du depot du jeu avec auto=true : il ouvre (ou met a jour) la PR
// develop → main et y pose auto-merge, l auto-merge la fusionne des que la CI est verte, le
// push sur main declenche `build.yml`, qui publie la release que la QA ira tester.
// L usine ne construit pas l APK elle-meme : le depot du jeu sait deja le faire.
export async function promoteGame({ gh, ticket, reportFile }) {
    await gh.dispatchWorkflow(ticket.repo, 'promote.yml', { ref: 'main', inputs: { auto: 'true' } });
    const summary = `Promotion demandee sur ${ticket.repo} (${ticket.promote.ahead} commit(s) d avance sur main).`;
    writeFileSync(reportFile, JSON.stringify({ status: 'SUCCESS', summary }, null, 2));
    console.log(summary);
}
