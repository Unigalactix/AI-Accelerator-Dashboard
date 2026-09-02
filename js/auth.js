(function(){
  const LOCAL_HOSTS = new Set(['localhost','127.0.0.1','::1']);
  const isLocal = LOCAL_HOSTS.has(location.hostname);
  const isAzure = /\.azurewebsites\.net$/i.test(location.hostname);
  const INACTIVITY_MS = 60 * 60 * 1000;
  let inactivityDeadline = 0;
  let inactivityTimer = null;
  let lastActivityReset = 0;

  function claim(user,...types){
    const claims = Array.isArray(user && user.user_claims) ? user.user_claims : [];
    for(const type of types){
      const needle = type.toLowerCase();
      const item = claims.find(value=>{
        const actual = String(value.typ || '').toLowerCase();
        return actual === needle || actual.endsWith('/' + needle);
      });
      if(item && item.val) return String(item.val);
    }
    return '';
  }
  function initials(name){
    const parts = String(name || '').replace(/\s*\([^)]*\)\s*$/,'').trim().split(/\s+/).filter(Boolean);
    return (((parts[0] && parts[0][0]) || '') + ((parts.length > 1 && parts[parts.length-1][0]) || '')).toUpperCase() || 'Q';
  }
  function goToLogin(){
    const returnTo = location.pathname + location.search;
    location.replace('/login.html?returnTo=' + encodeURIComponent(returnTo));
  }
  function signOutForInactivity(){
    if(isLocal){
      sessionStorage.removeItem('aiDash.localAuth');
      location.replace('/login.html?reason=inactive');
    }else{
      const redirect = encodeURIComponent('/login.html?reason=inactive');
      location.replace('/.auth/logout?post_logout_redirect_uri=' + redirect);
    }
  }
  function checkInactivity(){
    const remaining = inactivityDeadline - Date.now();
    if(remaining <= 0){ signOutForInactivity(); return; }
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(checkInactivity, remaining);
  }
  function resetInactivity(){
    const now = Date.now();
    if(now - lastActivityReset < 1000) return;
    lastActivityReset = now;
    inactivityDeadline = now + INACTIVITY_MS;
    checkInactivity();
  }
  function startInactivityTimer(){
    ['pointerdown','pointermove','keydown','wheel','touchstart','scroll'].forEach(eventName=>{
      document.addEventListener(eventName,resetInactivity,{passive:true});
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState === 'visible') checkInactivity();
    });
    resetInactivity();
  }
  function showProfile(user){
    const email = claim(user,'preferred_username','emailaddress','email','upn') || String(user.user_id || '');
    const name = claim(user,'name') || email.split('@')[0] || 'Quadrant user';
    document.getElementById('userAvatar').textContent = initials(name);
    document.getElementById('userName').textContent = name;
    document.getElementById('userEmail').textContent = email;
    document.getElementById('userProfile').hidden = false;

    const logout = document.getElementById('userLogout');
    if(isLocal){
      logout.href = '/login.html';
      logout.addEventListener('click',()=>sessionStorage.removeItem('aiDash.localAuth'));
    }else{
      logout.href = '/.auth/logout?post_logout_redirect_uri=%2Flogin.html';
    }
  }

  window.initAuthentication = async function(){
    if(!isLocal && !isAzure) return true;
    if(isLocal && sessionStorage.getItem('aiDash.localAuth') !== '1'){
      goToLogin();
      return false;
    }
    try{
      const response = await fetch('/.auth/me',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok){ goToLogin(); return false; }
      const users = await response.json();
      const user = Array.isArray(users) ? users.find(item=>String(item.provider_name || '').toLowerCase()==='aad') || users[0] : null;
      if(!user){ goToLogin(); return false; }
      showProfile(user);
      startInactivityTimer();
      return true;
    }catch(_){
      goToLogin();
      return false;
    }
  };
})();