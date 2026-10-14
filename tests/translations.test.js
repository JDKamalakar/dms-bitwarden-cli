const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const dir = path.join(__dirname, '..');
const de = JSON.parse(fs.readFileSync(path.join(dir, 'translations/de.json'), 'utf8')).bitwarden;
const helper = fs.readFileSync(path.join(dir, 'DmsUi/Tr.qml'), 'utf8');
const panel = fs.readFileSync(path.join(dir, 'Service.qml'), 'utf8');
let language = 'en';
const Tr = new Function('I18n', helper.slice(helper.indexOf('QtObject {') + 10, helper.lastIndexOf('}')) + '\nreturn {text, format};')({
    trFor(plugin, term, context) {
        assert.equal(plugin, 'bitwarden');
        assert.equal(context, 'bitwarden');
        return language === 'de' ? (de[term] || term) : term;
    }
});

test('translation helper follows DMS changes and preserves unknown terms', () => {
    language = 'en';
    assert.equal(Tr.text('Unlock Vault'), 'Unlock Vault');
    language = 'de';
    assert.equal(Tr.text('Unlock Vault'), 'Tresor entsperren');
    assert.equal(Tr.text('Untranslated upstream diagnostic'), 'Untranslated upstream diagnostic');
    assert.equal(Tr.text(undefined), '');
    language = 'en';
    assert.equal(Tr.text('Unlock Vault'), 'Unlock Vault');
});

test('translated placeholders preserve literal values without recursive substitution', () => {
    language = 'de';
    assert.equal(Tr.format('Copy %1', 'Demo %2'), 'Demo %2 kopieren');
    assert.equal(Tr.format('Copy %1'), '%1 kopieren');
    language = 'en';
    assert.equal(Tr.format('Copy %1', 'Demo'), 'Copy Demo');
});

test('login labels translate without changing authentication states', () => {
    const body = panel.match(/function emailLoginButtonText\(\) \{([\s\S]*?)\n  \}/)[1];
    const button = new Function('Tr', 'logoutCleanupFailed', 'logoutPending', 'isLoading', 'show2faField', body);
    language = 'de';
    assert.equal(button(Tr, false, false, false, false), 'Anmelden und entsperren');
    assert.equal(button(Tr, false, false, false, true), 'Bestätigen und entsperren');
    assert.equal(button(Tr, false, false, true, false), 'Anmeldung läuft …');
    assert.equal(button(Tr, true, false, false, false), 'Abmeldung erneut abschließen');
});

test('all marked literal UI terms and settings metadata have German translations', () => {
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.qml'))) {
        const source = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const match of source.matchAll(/Tr\.(?:text|format)\(("(?:\\.|[^"\\])*")/g)) {
            const term = JSON.parse(match[1]);
            assert.ok(de[term], `${file}: missing ${term}`);
            assert.deepEqual(de[term].match(/%[1-9][0-9]*/g)?.sort() || [], term.match(/%[1-9][0-9]*/g)?.sort() || []);
        }
    }
    const model = new Function(fs.readFileSync(path.join(dir, 'BitwardenModel.js'), 'utf8')
        .replace(/^\.pragma library\s*$/m, '') + '\nreturn SETTINGS_SCHEMA;')();
    for (const entry of model) {
        for (const key of ['label', 'description', 'unit', 'zeroLabel']) {
            if (entry[key]) assert.ok(de[entry[key]], `setting ${entry.key}: missing ${entry[key]}`);
        }
    }
});
