// Apply the saved theme before styles and React load to avoid a white first frame.
try {
  const savedTheme = localStorage.getItem('hc_theme');
  const theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-bs-theme', theme);
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#12121a' : '#f5f5fa';
} catch { /* Browsers with restricted storage can use the default theme. */ }
