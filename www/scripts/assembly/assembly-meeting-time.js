(function (root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.CondomitAssemblyMeetingTime=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function valid(value) {
    if(!value) return null;
    const date=new Date(String(value));
    return Number.isFinite(date.getTime())?date:null;
  }
  function localDate(value) {
    const date=valid(value);
    return date?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(date):'';
  }
  function localTime(value) {
    const date=valid(value);
    return date?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date):'';
  }
  function meetingMeta(meeting) {
    const actualStart=valid(meeting?.started_at);
    const actualEnd=valid(meeting?.ended_at);
    const date=actualStart?localDate(actualStart):String(meeting?.date||'').slice(0,10).split('-').reverse().join('/');
    const start=actualStart?localTime(actualStart):String(meeting?.start_time||'').slice(0,5);
    const end=actualEnd && (!actualStart || actualEnd>=actualStart)?localTime(actualEnd):'';
    return {date:date||'Data não informada',start:start||'--:--',end:end||null,
      range:`${start||'--:--'}${end?` – ${end}`:''}`};
  }
  return {localDate,localTime,meetingMeta};
});
