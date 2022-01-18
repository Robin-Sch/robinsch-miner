const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
console.log(vendor);
if (vendor.includes('NVIDIA') || vendor.includes('AMD')) document.getElementById('start-miner-gpu').disabled = false;
else document.getElementById('log').innerHTML += '<tr class="table-warning"><th scope=\"row\">gpu</th><th>No supported GPU found</th></tr>';