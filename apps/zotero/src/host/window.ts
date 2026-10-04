export interface AvailableScreen {availWidth?:number;availHeight?:number}

/** Keep the initial manager window inside the work area, including high-DPI displays. */
export function managerWindowFeatures(screen:AvailableScreen):string {
 const width=Math.max(720,Math.min(900,Number(screen.availWidth??1200)-80));
 const height=Math.max(420,Math.min(600,Number(screen.availHeight??800)-80));
 return `chrome,dialog=no,titlebar,close,minimizable,resizable,centerscreen,width=${Math.floor(width)},height=${Math.floor(height)}`;
}
