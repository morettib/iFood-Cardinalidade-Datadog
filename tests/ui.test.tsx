import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import App,{Status,MetricPanel} from '../src/App';
import {QueryError} from '../src/api';
import {tight} from '../src/domain';
it('renders the Pods screen with UTC range and verified seed pod',()=>{
  const html=renderToStaticMarkup(<App/>);expect(html).toContain('Pods');expect(html).toContain('search-cook-grpc-6cbd9c9b98-6hx4p');expect(html).toContain('CPU do container');expect(html).toContain('Linha do tempo de eventos');
});
it('renders permission, query failure and successful empty as distinct messages',()=>{
  expect(renderToStaticMarkup(<Status resource={{key:'x',state:'error',error:new QueryError('permission','HTTP 403')}}/>)).toContain('Permissão negada');
  expect(renderToStaticMarkup(<Status resource={{key:'x',state:'error',error:new QueryError('query','failed job')}}/>)).toContain('Falha na consulta');
  expect(renderToStaticMarkup(<Status resource={{key:'x',state:'success',data:[]}} empty/>)).toContain('Consulta concluída. Nenhum dado');
});
it('renders CPU unit and container identity with timestamp',()=>{
  const html=renderToStaticMarkup(<MetricPanel title="CPU do container" unit="cores" range={tight} resource={{key:'x',state:'success',data:[{metric:{container_name:'app',container_id:'container-incarnation-1'},values:[[1794499000,'0.025']]}]}}/>);
  expect(html).toContain('núcleos');expect(html).toContain('container-incarnation-1');expect(html).toContain('0,025');expect(html).toContain('2026-11-12');
});
