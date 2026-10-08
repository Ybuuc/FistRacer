// Procedural audio: no remote audio files and no microphone access.
export class RaceAudio {
 constructor(){this.volume=.4;this.muted=false;this.ctx=null}
 async unlock() {
  try {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.init();
    }

    if (!this.ctx) {
      throw new Error('Браузер не поддерживает AudioContext');
    }

    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }

    this.applyVolume();

    return this.ctx.state === 'running';
  } catch (error) {
    console.error('Ошибка запуска звука:', error);
    return false;
  }
}
 init(){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;const c=this.ctx=new C();this.master=c.createGain();this.master.gain.value=this.muted?0:this.volume;const limiter=c.createDynamicsCompressor();this.master.connect(limiter);limiter.connect(c.destination);
 this.motor=c.createGain();this.motor.gain.value=0;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;this.motor.connect(filter);filter.connect(this.master);
 this.osc=[1,2,3].map((harmonic,i)=>{const o=c.createOscillator(),g=c.createGain();o.type=i===0?'sawtooth':'triangle';o.frequency.value=38*harmonic;g.gain.value=[.38,.18,.1][i];o.connect(g);g.connect(this.motor);o.start();return o});
 this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 const n=c.createBufferSource();n.buffer=this.noise;n.loop=true;this.skid=c.createGain();this.skid.gain.value=0;const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=1500;f.Q.value=.8;n.connect(f);f.connect(this.skid);this.skid.connect(this.master);n.start();this.filter=filter;
 }
 setVolume(v){this.volume=Number(v);this.applyVolume()}
 toggle(){this.muted=!this.muted;this.applyVolume();return this.muted}
 applyVolume(){if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.ctx.currentTime,.03)}
 update(speed,gas,brake,running){if(!this.ctx)return;const t=this.ctx.currentTime,gear=Math.min(4,Math.floor(speed/38)),rpm=38+speed*.6-gear*12+(gas?12:0);this.osc.forEach((o,i)=>o.frequency.setTargetAtTime(rpm*(i+1),t,.09));this.motor.gain.setTargetAtTime(running?.12+speed/900+(gas?.08:0):0,t,.07);this.filter.frequency.setTargetAtTime(350+speed*6+(gas?200:0),t,.1);this.skid.gain.setTargetAtTime(running&&brake&&speed>12?Math.min(.22,speed/650):0,t,.06)}
 tone(freq,delay,duration=.18){if(!this.ctx)return;const c=this.ctx,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.22,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect()}}
 cue(kind){if(!this.ctx||this.ctx.state!=='running')return;if(kind==='crash'){const c=this.ctx,t=c.currentTime,n=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();n.buffer=this.noise;f.type='lowpass';f.frequency.value=900;g.gain.setValueAtTime(.7,t);g.gain.exponentialRampToValueAtTime(.001,t+.45);n.connect(f);f.connect(g);g.connect(this.master);n.start();n.stop(t+.5);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect()};this.tone(65,0,.35);return}
 const notes=kind==='win'?[523,659,784,1047]:kind==='over'?[330,247,165]:[440,660,880];notes.forEach((f,i)=>this.tone(f,i*.15,kind==='win'?.35:.18));}
 close(){this.ctx?.close().catch(()=>{})}
}
