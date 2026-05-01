async function loadSchema() {
  const response = await fetch('schema.json');
  return await response.json();
}
