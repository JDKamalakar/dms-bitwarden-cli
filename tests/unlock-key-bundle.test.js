// DMS uses only locally built helpers; upstream's bundled artifacts must never execute.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {loadModule, repoRoot} = require('./harness');
const Model = loadModule();
for (const [spec, parse] of [[Model.UNLOCK_KEY_SPEC, Model.parseUnlockKeyInspection], [Model.VAULT_HELPER_SPEC, Model.parseVaultHelperInspection]]) {
 test(`${spec.name}: local build only, missing and unusable binaries fail closed`, () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dms-helper-'));
  try {
   const marker=path.join(dir,'executed');
   const bundled=path.join(dir,spec.bundled);
   fs.mkdirSync(path.dirname(bundled),{recursive:true});
   fs.writeFileSync(bundled,`#!/bin/sh\ntouch '${marker}'\n`,{mode:0o755});
   const inspect=()=>{
    const cmd=Model.helperInspectCommand(dir,spec);
    const result=spawnSync(cmd[0],cmd.slice(1),{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr);
    return parse(result.stdout);
   };
   assert.equal(inspect().state,'missing');
   assert.equal(Model.helperPath(dir,spec,'bundled'),'');
   assert.equal(fs.existsSync(marker),false);
   const local=path.join(dir,spec.development);
   fs.mkdirSync(path.dirname(local),{recursive:true});
   fs.copyFileSync(path.join(repoRoot,spec.development),local);
   fs.chmodSync(local,0o755);
   const valid=inspect();
   assert.equal(valid.state,'ok',JSON.stringify(valid));
   assert.equal(valid.source,'development');
   fs.chmodSync(local,0o644);
   assert.equal(inspect().state,'not-executable');
   fs.writeFileSync(local,'incomplete build');fs.chmodSync(local,0o755);
   assert.equal(inspect().state,'not-elf');
   assert.equal(fs.existsSync(marker),false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
 });
}
