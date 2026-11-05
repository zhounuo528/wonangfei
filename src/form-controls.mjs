// Enter opens the native customizable picker instead of submitting its form.
// Arrow navigation, selection, Escape, Tab and accessibility remain native.
if (globalThis.CSS?.supports('appearance','base-select')) {
  document.addEventListener('keydown',event=>{
    const select=event.target instanceof Element?event.target.closest('select'):null;
    if(!select||select.disabled||event.defaultPrevented||event.isComposing||event.key!=='Enter'||event.altKey||event.ctrlKey||event.metaKey||select.matches(':open')||typeof select.showPicker!=='function')return;
    event.preventDefault();
    select.showPicker();
  });
}
