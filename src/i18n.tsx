import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {request} from './api';
import {english} from './translations';
export type Language='pt-BR'|'en';
declare global {interface Window {getCriblUser?:()=>Promise<{id:string}>}}
const LanguageContext=createContext({language:'pt-BR' as Language,setLanguage:(_language:Language)=>{}});
export function LanguageProvider({children}:{children:ReactNode}){
 const [language,updateLanguage]=useState<Language>('pt-BR'),path=useRef('/kvstore/preferences/ui-language'),changed=useRef(false);
 useEffect(()=>{const abort=new AbortController();void (async()=>{if(window.getCriblUser){const user=await window.getCriblUser();path.current='/kvstore/preferences/'+encodeURIComponent(user.id)+'/ui-language';}const value=await (await request(path.current,abort.signal)).json();if(!abort.signal.aborted&&!changed.current&&(value==='en'||value==='pt-BR'))updateLanguage(value);})().catch(()=>{});return()=>abort.abort();},[]);
 useEffect(()=>{document.documentElement.lang=language==='en'?'en':'pt-BR';},[language]);
 const setLanguage=(value:Language)=>{changed.current=true;updateLanguage(value);void request(path.current,AbortSignal.timeout(5000),{method:'PUT',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(value)}).catch(()=>{});};
 return <LanguageContext.Provider value={{language,setLanguage}}>{children}</LanguageContext.Provider>;
}
export const useLanguage=()=>useContext(LanguageContext);
const fragments=Object.entries(english).sort(([a],[b])=>b.length-a.length).map(([source,target])=>({pattern:new RegExp('(?<![\\p{L}])'+source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}])','gu'),target}));
export function translate(value:string,language:Language):string{if(language!=='en')return value;if(english[value])return english[value];let result=value;for(const {pattern,target}of fragments)result=result.replace(pattern,()=>target);return result;}
export function translatedNode(value:string,language:Language):string;
export function translatedNode(value:ReactNode,language:Language):ReactNode;
export function translatedNode(value:ReactNode,language:Language):ReactNode{return typeof value==='string'?translate(value,language):Array.isArray(value)?value.map(v=>translatedNode(v,language)):value;}
