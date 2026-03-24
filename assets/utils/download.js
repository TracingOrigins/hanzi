(function () {
  const root = (window.HanziUtils = window.HanziUtils || {});

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function downloadTextAsFile(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' });
    downloadBlob(blob, filename);
  }

  root.download = {
    downloadBlob,
    downloadTextAsFile
  };
})();
