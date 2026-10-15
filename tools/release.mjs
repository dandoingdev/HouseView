// Release gate and asset staging.
//
// Usage: node tools/release.mjs [--tag=v1.0.0] [--verify] [--stage] [--out=dist/release]
//   (no mode flag)  verify, then stage
//   --verify        check only: tag == package version (when a tag is given or GITHUB_REF_NAME is a v* ref),
//                   a CHANGELOG.md section for the version exists, dist/ is a production build whose
//                   sha256 is consistent
//   --stage         copy the allow-listed dist files to --out and write NOTES.md (the CHANGELOG section)
//
// Only files in RELEASE_FILES ever leave dist/; nothing else from the repository can be attached.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Release assets HACS and the manual installer need (docs/architecture.md). */
export const RELEASE_FILES = ['houseview.js', 'houseview.js.map', 'houseview.js.sha256'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Text of the `## [version]` section (without its heading), or null. */
export function changelogSection(changelog, version) {
  const escaped = version.replace(/\./g, '\\.');
  const heading = new RegExp(`^##\\s+\\[?v?${escaped}\\]?(?:\\s.*)?$`, 'm').exec(changelog);
  if (!heading) return null;
  const rest = changelog.slice(heading.index + heading[0].length);
  const next = /^##\s/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** @returns {string[]} problems; empty when the release may proceed */
export function verify({repo = REPO, tag} = {}) {
  const problems = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const version = pkg.version;

  if (tag) {
    if (tag !== `v${version}`)
      problems.push(`tag ${tag} does not match package.json version v${version}`);
  } else {
    console.log('release: no tag given, skipping the tag/version comparison');
  }

  const changelogFile = path.join(repo, 'CHANGELOG.md');
  if (!fs.existsSync(changelogFile)) {
    problems.push('CHANGELOG.md is missing');
  } else {
    const section = changelogSection(fs.readFileSync(changelogFile, 'utf8'), version);
    if (section === null) problems.push(`CHANGELOG.md has no "## [${version}]" section`);
    else if (!section) problems.push(`CHANGELOG.md section for ${version} is empty`);
  }

  const dist = path.join(repo, 'dist');
  const main = path.join(dist, 'houseview.js');
  if (!fs.existsSync(main)) {
    problems.push('dist/houseview.js is missing; run `npm run build`');
    return problems;
  }
  const bytes = fs.readFileSync(main);
  const text = bytes.toString('utf8');
  if (!text.includes(`HouseView v${version}`))
    problems.push(`dist/houseview.js banner is not v${version}`);
  if (/sourceMappingURL=data:/.test(text))
    problems.push('dist/houseview.js is a --dev build (inline sourcemap)');
  const sumFile = path.join(dist, 'houseview.js.sha256');
  if (!fs.existsSync(sumFile) || !fs.readFileSync(sumFile, 'utf8').startsWith(sha256(bytes))) {
    problems.push('dist/houseview.js.sha256 is missing or stale');
  }
  if (!fs.existsSync(path.join(dist, 'houseview.js.map')))
    problems.push('dist/houseview.js.map is missing');
  return problems;
}

export function stage({repo = REPO, out = 'dist/release'} = {}) {
  const dist = path.join(repo, 'dist');
  const target = path.resolve(repo, out);
  fs.rmSync(target, {recursive: true, force: true});
  fs.mkdirSync(target, {recursive: true});
  for (const name of RELEASE_FILES) {
    fs.copyFileSync(path.join(dist, name), path.join(target, name));
  }
  const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
  const notes = changelogSection(fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8'), version);
  fs.writeFileSync(path.join(target, 'NOTES.md'), `${notes}\n`);
  return {target, version};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  let tag = opt('tag');
  if (!tag && /^v\d/.test(process.env.GITHUB_REF_NAME || '')) tag = process.env.GITHUB_REF_NAME;
  const verifyOnly = args.includes('--verify');
  const stageOnly = args.includes('--stage');
  if (!stageOnly) {
    const problems = verify({tag});
    if (problems.length) {
      for (const p of problems) console.error(`release: ${p}`);
      process.exit(1);
    }
    console.log('release: checks passed');
  }
  if (!verifyOnly) {
    if (stageOnly && verify({tag}).length) {
      console.error('release: refusing to stage; run without --stage to see the problems');
      process.exit(1);
    }
    const {target, version} = stage({out: opt('out')});
    console.log(`release: staged v${version} assets in ${path.relative(REPO, target)}`);
  }
}
