// One screenshot, sized for the authenticated local relay.
export async function prepareScreenshot(file) {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>20*1024*1024)
    throw new Error('Choose a PNG, JPEG or WebP smaller than 20 MB.');
  const url=URL.createObjectURL(file), image=new Image();
  try {
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Could not decode screenshot.'));image.src=url;});
    const canvas=document.createElement('canvas');
    let scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    for(let attempt=0;attempt<7;attempt++) {
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',attempt<2?.88:.78);
      if(data.length<=180000)return {url:data};
      scale*=.8;
    }
    throw new Error('Screenshot is too detailed. Crop it and try again.');
  } finally {URL.revokeObjectURL(url);}
}
