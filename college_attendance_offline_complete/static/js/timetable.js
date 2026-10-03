let rows=[];
const $=id=>document.getElementById(id);
function fillFilters(){
  const weeks=[...new Set(rows.map(x=>x.week))];
  $('weekFilter').innerHTML='<option value="">All Weeks</option>'+weeks.map(w=>`<option>${w}</option>`).join('');
  const courses=[...new Set(rows.map(x=>x.course).filter(Boolean))].sort();
  $('courseFilter').innerHTML='<option value="">All Courses</option>'+courses.map(c=>`<option>${c}</option>`).join('');
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function render(){
  const week=$('weekFilter').value, course=$('courseFilter').value, q=$('search').value.trim().toLowerCase();
  const filtered=rows.filter(x=>
    (!week||x.week===week)&&(!course||x.course===course)&&(!q||Object.values(x).some(v=>String(v??'').toLowerCase().includes(q)))
  );
  $('count').textContent=`Showing ${filtered.length} of ${rows.length} timetable entries`;
  $('timetableBody').innerHTML=filtered.map(x=>{const idx=(x.id!==undefined&&x.id!==null)?x.id:rows.indexOf(x); return `<tr class="timetable-row" data-index="${idx}" tabindex="0" title="Click to select this timetable entry" style="cursor:pointer">
    <td>${esc(x.date)}</td><td>${esc(x.day)}</td><td>${esc(x.time_slot)}</td><td>${esc(x.course)}</td><td>${esc(x.section_group)}</td><td>${esc(x.venue)}</td><td>${esc(x.no_of_students)}</td><td>${esc(x.resource_person)}</td><td>${esc(x.module)}</td><td>${esc(x.spoc)}</td><td>${esc(x.link)}</td>
  </tr>`}).join('')||'<tr><td colspan="11">No timetable entries found.</td></tr>';
  document.querySelectorAll('.timetable-row').forEach(row=>{
    const open=()=>{ const i=row.dataset.index; window.location.href=`/faculty/timetable/${i}/course/`; };
    row.addEventListener('click',open); row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  });
}
async function init(){
 try{const r=await fetch('/static/data/timetable.json'); if(!r.ok)throw Error('Could not load timetable.json'); const payload=await r.json(); rows=Array.isArray(payload)?payload:(payload.entries||[]); fillFilters(); render();}
 catch(e){$('count').textContent=e.message;}
}
['weekFilter','courseFilter'].forEach(id=>$(id).addEventListener('change',render)); $('search').addEventListener('input',render); $('clear').onclick=()=>{$('weekFilter').value='';$('courseFilter').value='';$('search').value='';render();}; init();
