import fs from 'node:fs/promises';
const key=process.env.GOOGLE_SOLAR_API_KEY;
if(!key)throw new Error('Missing GOOGLE_SOLAR_API_KEY repository secret');
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
function readRoutes(name){const marker='const '+name+'=',start=html.indexOf(marker);if(start<0)throw new Error('Missing '+name);const from=start+marker.length,end=html.indexOf(';\n',from);return JSON.parse(html.slice(from,end))}
const all=[...readRoutes('rocklinRoutes'),...readRoutes('stocktonRoutes')].flatMap(r=>r.stops);
const unique=[...new Map(all.map(s=>[s.record_key||s.address,s])).values()];
const old=JSON.parse(await fs.readFile(new URL('../solar-insights.json',import.meta.url),'utf8').catch(()=>'{"entries":{}}'));
const entries=old.entries||{},week=Math.floor(Date.now()/604800000),requested=process.env.SOLAR_SHARD||'auto',shard=requested==='auto'?week%4:requested;
const selected=shard==='all'?unique:unique.filter(s=>{let n=0;for(const c of (s.record_key||s.address))n=(n*31+c.charCodeAt(0))>>>0;return n%4===+shard});
for(let i=0;i<selected.length;i++){
  const s=selected[i];if(s.latitude==null||s.longitude==null)continue;
  const u=new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest');
  u.searchParams.set('location.latitude',s.latitude);u.searchParams.set('location.longitude',s.longitude);u.searchParams.set('requiredQuality','MEDIUM');u.searchParams.set('key',key);
  const res=await fetch(u);if(res.status===404)continue;if(!res.ok)throw new Error('Google Solar request failed '+res.status+' at '+s.address+': '+await res.text());
  const j=await res.json(),p=j.solarPotential||{};
  entries[s.record_key||s.address]={refreshedAt:new Date().toISOString(),imageryQuality:j.imageryQuality||'',imageryDate:j.imageryDate||null,maxArrayPanelsCount:p.maxArrayPanelsCount??null,maxArrayAreaMeters2:p.maxArrayAreaMeters2??null,maxSunshineHoursPerYear:p.maxSunshineHoursPerYear??null,carbonOffsetFactorKgPerMwh:p.carbonOffsetFactorKgPerMwh??null};
  if((i+1)%25===0)console.log('Processed '+(i+1)+' of '+selected.length);
}
const cutoff=Date.now()-30*86400000;for(const [k,v] of Object.entries(entries))if(!v.refreshedAt||new Date(v.refreshedAt).getTime()<cutoff)delete entries[k];
await fs.writeFile(new URL('../solar-insights.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),source:'Google Solar API Building Insights',attribution:'Source: Includes solar data from Google',entries},null,2)+'\n');
console.log('Saved '+Object.keys(entries).length+' Google Solar records');
