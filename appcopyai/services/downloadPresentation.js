function downloadPresentation(item = {}, formatSize = () => '') {
  const busy = item.status === 'downloading';
  const phase = item.phase || 'transferring';
  const percent = item.progressKnown === false ? null : Math.max(0, Math.min(100, Math.round((Number(item.progress) || 0) * 100)));
  let label = item.status === 'done' ? 'Ready offline' : 'Download failed';
  let shortLabel = item.status === 'done' ? 'Saved' : 'Retry';
  if (busy) {
    if (phase === 'preparing') { label = 'Preparing video…'; shortLabel = 'Preparing'; }
    else if (phase === 'finalizing') { label = 'Finishing download…'; shortLabel = 'Finishing'; }
    else if (phase === 'cancelling') { label = 'Cancelling…'; shortLabel = 'Cancelling'; }
    else { label = percent === null ? 'Downloading…' : `Downloading ${percent}%`; shortLabel = percent === null ? 'Saving' : `${percent}%`; }
  }
  const written = Math.max(0, Number(item.bytesWritten) || 0);
  const total = Math.max(0, Number(item.totalBytes) || 0);
  const detail = !busy ? formatSize(item.size) : phase === 'preparing' ? 'Size will be shown when available.'
    : phase === 'finalizing' ? 'Checking the saved video.' : phase === 'cancelling' ? 'Stopping and removing partial files.'
    : total > 0 ? `${formatSize(written) || '0 KB'} of ${formatSize(total)}`
    : written > 0 ? `${formatSize(written)} downloaded · Total size unknown` : 'Total size unknown';
  return { busy, phase, percent, label, shortLabel, detail, canCancel: busy && phase !== 'cancelling' };
}

module.exports = { downloadPresentation };
