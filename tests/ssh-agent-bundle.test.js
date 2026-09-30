const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const repo = path.join(__dirname, '..');
const Model = {};
new Function('exports', fs.readFileSync(path.join(repo, 'BitwardenModel.js'), 'utf8').replace(/^\.pragma library\s*$/m,'') + `
exports.inspect=sshAgentHelperInspectCommand;
exports.parse=parseSshAgentHelperInspection;
exports.candidates=sshAgentHelperCandidates;
exports.command=sshAgentHelperCommand;
`)(Model);
function inspect(dir) {
 const cmd=Model.inspect(dir);
 const run=spawnSync(cmd[0],cmd.slice(1),{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 return Model.parse(run.stdout);
}
test('only local Cargo output is eligible, never a bundled source',()=> {
 assert.deepEqual(Model.candidates('/opt/bw'),[{source:'development',path:'/opt/bw/agent/target/debug/qs-bitwarden-ssh-agent'}]);
 assert.deepEqual(Model.candidates('/opt/../bw'),[]);
 assert.deepEqual(Model.command('/opt/bw','bundled'),[]);
});
test('bundled executable is not probed or launched, even without a local build',()=> {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bw-local-only-'));
 try {
 const bin=path.join(dir,'bin/x86_64-linux');fs.mkdirSync(bin,{recursive:true});
 const marker=path.join(dir,'executed');
 fs.writeFileSync(path.join(bin,'qs-bitwarden-ssh-agent'),`#!/bin/sh\ntouch '${marker}'\n`,{mode:0o755});
 assert.equal(inspect(dir).state,'missing');assert.equal(fs.existsSync(marker),false);
 const local=path.join(dir,'agent/target/debug');fs.mkdirSync(local,{recursive:true});
 fs.copyFileSync(path.join(repo,'agent/target/debug/qs-bitwarden-ssh-agent'),path.join(local,'qs-bitwarden-ssh-agent'));
 const result=inspect(dir);assert.equal(result.state,'ok');assert.equal(result.source,'development');assert.equal(result.selfTest,'pass');
 assert.equal(fs.existsSync(marker),false);
 fs.chmodSync(path.join(local,'qs-bitwarden-ssh-agent'),0o644);
 assert.equal(inspect(dir).state,'not-executable');assert.equal(fs.existsSync(marker),false);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
