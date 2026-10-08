// Cached vector sprites, drawn once at high resolution instead of per-frame paths.
const cache=new Map();
export function carSprite(color,style='sport',braking=false){const key=[color,style,braking].join();if(cache.has(key))return cache.get(key);const c=document.createElement('canvas');c.width=240;c.height=440;const g=c.getContext('2d');
 const suv=style==='suv',coupe=style==='coupe',left=suv?46:52,right=240-left;
 const round=(x,y,w,h,r,fill,stroke)=>{g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=2;g.stroke()}};
 const poly=(pts,fill)=>{g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=fill;g.fill()};
 // Contact shadow and tyres.
 g.save();g.shadowColor='#000b';g.shadowBlur=18;g.shadowOffsetY=12;round(40,39,160,352,46,'#0009');g.restore();
 for(const x of [30,185])for(const y of [93,292]){round(x,y,25,70,8,'#080b10');round(x+4,y+8,17,54,5,'#202938');g.strokeStyle='#455263';g.lineWidth=2;for(let z=0;z<4;z++){g.beginPath();g.moveTo(x+6,y+14+z*13);g.lineTo(x+19,y+14+z*13);g.stroke()}}
 // Headlight pools are baked into sprite.
 const glow=g.createLinearGradient(0,0,0,70);glow.addColorStop(0,'#a9eeff00');glow.addColorStop(1,'#a9eeff44');poly([[left+8,72],[left+33,72],[left+51,0],[left-24,0]],glow);poly([[right-33,72],[right-8,72],[right+24,0],[right-51,0]],glow);
 const paint=g.createLinearGradient(35,0,200,0);paint.addColorStop(0,'#102437');paint.addColorStop(.15,color);paint.addColorStop(.43,'#d8fff5');paint.addColorStop(.52,color);paint.addColorStop(.85,color);paint.addColorStop(1,'#182735');
 g.beginPath();g.moveTo(80,42);g.bezierCurveTo(51,43,left,65,left,110);g.lineTo(left-5,320);g.quadraticCurveTo(left-6,379,78,386);g.lineTo(162,386);g.quadraticCurveTo(right+6,379,right+5,320);g.lineTo(right,110);g.bezierCurveTo(right,65,189,43,160,42);g.closePath();g.fillStyle=paint;g.fill();g.strokeStyle='#bdf4ff77';g.lineWidth=2;g.stroke();
 round(72,47,96,12,5,'#102234');
 // Sculpted bonnet, seams, vents.
 poly([[82,80],[158,80],[171,151],[69,151]],'#ffffff12');g.strokeStyle='#162e4566';g.lineWidth=3;for(const x of [75,165]){g.beginPath();g.moveTo(x,90);g.lineTo(x+(x<120?-8:8),148);g.stroke()}
 for(const x of [73,149])for(let y=117;y<141;y+=7)round(x,y,18,3,1,'#142639');
 const glass=g.createLinearGradient(0,150,0,300);glass.addColorStop(0,'#7798af');glass.addColorStop(.35,'#1d364d');glass.addColorStop(1,'#080f20');
 poly([[72,157],[168,157],[180,215],[60,215]],'#0a1729');poly([[78,163],[162,163],[171,207],[69,207]],glass);poly([[83,166],[113,166],[95,206],[73,206]],'#b8eaff33');
 round(72,217,96,suv?79:66,14,paint,'#113244');
 // Side windows, mirrors and rear glass.
 poly([[58,190],[67,222],[67,292],[55,311]],'#142b40');poly([[182,190],[173,222],[173,292],[185,311]],'#142b40');round(33,190,25,14,6,color);round(182,190,25,14,6,color);
 poly([[73, suv?300:286],[167,suv?300:286],[177,326],[63,326]],glass);
 if(suv){round(64,211,5,86,2,'#192934');round(171,211,5,86,2,'#192934')}else{for(const x of [109,125]){round(x,66,6,86,1,'#14353eaa');round(x,223,6,53,1,'#14353e99');round(x,332,6,26,1,'#14353eaa')}}
 round(61,361,118,21,6,'#122131');round(96,369,48,8,2,'#617587');for(const x of [70,156])round(x,381,14,7,3,'#090d13','#9baab4');
 // Bright front LEDs and red rear lights.
 for(const x of [61,148]){g.save();g.shadowColor='#c9f8ff';g.shadowBlur=12;round(x,70,31,9,4,'#edffff');g.restore()}
 for(const x of [58,149]){g.save();g.shadowColor='#ff263e';g.shadowBlur=braking?25:7;round(x,344,33,10,4,braking?'#ff5361':'#bb203f');g.restore()}
 if(!suv&&!coupe){round(60,332,8,17,2,'#192838');round(172,332,8,17,2,'#192838');round(47,330,146,10,3,'#172535','#648294')}
 cache.set(key,c);return c;
}
export function drawCar(ctx,x,y,scale,color,style,braking,angle,width,height){ctx.save();ctx.translate(x,y);ctx.rotate(angle);const bodyWidth=width*.068*scale,bodyHeight=height*.17*scale;ctx.drawImage(carSprite(color,style,braking),-bodyWidth*.75,-bodyHeight*1.12,bodyWidth*1.5,bodyHeight*1.25);ctx.restore()}
