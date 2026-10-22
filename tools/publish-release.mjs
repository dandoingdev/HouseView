// Publish once per tag. Duplicate tag pushes and workflow reruns must leave a
// complete published release alone; API failures must still fail the job.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {RELEASE_FILES} from './release.mjs';

export async function publishRelease({
  repository = process.env.GITHUB_REPOSITORY,
  tag = process.env.GITHUB_REF_NAME,
  token = process.env.GH_TOKEN,
  request = fetch,
  run = execFileSync
} = {}) {
  if (!repository || !tag || !token) {
    throw new Error('GITHUB_REPOSITORY, GITHUB_REF_NAME and GH_TOKEN are required');
  }
  const response = await request(
    `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: globalThis.AbortSignal.timeout(30_000)
    }
  );
  if (response.ok) {
    const release = await response.json();
    const complete = RELEASE_FILES.every((name) =>
      release.assets?.some((asset) => asset.name === name && asset.state === 'uploaded')
    );
    if (release.draft || !complete) {
      throw new Error(
        `Release ${tag} exists but is a draft or has missing assets; inspect it before retrying`
      );
    }
    console.log(`Release ${tag} is already published with all assets; nothing to publish`);
    return;
  }
  if (response.status !== 404) {
    throw new Error(`Could not check release ${tag}: GitHub returned HTTP ${response.status}`);
  }
  run(
    'gh',
    [
      'release',
      'create',
      tag,
      ...RELEASE_FILES.map((name) => `dist/release/${name}`),
      '--repo',
      repository,
      '--verify-tag',
      '--title',
      `HouseView ${tag.replace(/^v/, '')}`,
      '--notes-file',
      'dist/release/NOTES.md',
      ...(tag.includes('-') ? ['--prerelease'] : [])
    ],
    {stdio: 'inherit'}
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishRelease().catch((error) => {
    console.error(`release: ${error.message}`);
    process.exitCode = 1;
  });
}
