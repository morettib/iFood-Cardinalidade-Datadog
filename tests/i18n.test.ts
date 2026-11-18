import {it,expect} from 'vitest';
import {translate,translatedNode} from '../src/i18n';
it('translations preserve Portuguese evidence semantics and distinguish pending from unused in English',()=>{
 expect(translate('Uso não verificado','pt-BR')).toBe('Uso não verificado');expect(translate('Uso não verificado','en')).toBe('Usage unverified');expect(translate('Sem uso observado · verificado','en')).toBe('No usage observed · Verified');expect(translate('Sem referência encontrada · pendente','en')).toBe('No reference found · Pending');expect(translate('1 · Oportunidades sem uso observado','en')).toBe('1 · Opportunities with no observed usage');
});
it('display translation preserves metric identifiers, numbers and React values',()=>{
 const metric='istio.mesh.request.duration.milliseconds';expect(translate(metric,'en')).toBe(metric);expect(translatedNode([12,metric,'Com dependências'],'en')).toEqual([12,metric,'With dependencies']);expect(translate('Desmarcar pod_name','en')).toBe('Deselect pod_name');
});
