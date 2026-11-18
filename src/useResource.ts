import { useEffect,useState } from 'react';
import { QueryError } from './api';
export type Resource<T>={key:string;state:'loading'|'success'|'error';data?:T;error?:QueryError};
export function useResource<T>(key:string,load:(signal:AbortSignal)=>Promise<T>):Resource<T> {
  const [value,setValue]=useState<Resource<T>>({key,state:'loading'});
  useEffect(()=>{
    const controller=new AbortController();setValue({key,state:'loading'});
    void load(controller.signal).then(data=>{if(!controller.signal.aborted)setValue({key,state:'success',data});}).catch(e=>{if(!controller.signal.aborted)setValue({key,state:'error',error:e instanceof QueryError?e:new QueryError('query','Não foi possível concluir a consulta.')});});
    return ()=>controller.abort();
    // The immutable key contains every input of the request; loaders change on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  return value.key===key?value:{key,state:'loading'};
}
