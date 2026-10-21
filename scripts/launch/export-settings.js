// Export snippet for the launch data step (task 4.8). Paste it into the browser console on the owner's main computer,
// on the page where the old app runs (the live site), and press Enter. It saves company-settings.json to Downloads:
// the company options and columns that browser kept, as the old app stored them. It only reads; nothing changes.
(() => {
  const read = (key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  };
  const data = {
    exportedAt: new Date().toISOString(),
    from: location.origin,
    options: read("clients_dp_options"),
    columns: read("clients_col_config"),
  };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  link.download = "company-settings.json";
  link.click();
  if (!data.options || !data.columns)
    console.warn("This browser kept no company options or columns here. Is this the browser and the address where the old app's companies are used?");
  console.log("Saved company-settings.json", data);
})();
