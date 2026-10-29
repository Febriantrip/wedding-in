import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PAGE_SIZE,Pagination,SortHeading} from '../src/components/useListView';

test('pagination membatasi setiap halaman menjadi maksimum 15 data',()=>{
  assert.equal(PAGE_SIZE,15);
  const html=renderToStaticMarkup(React.createElement(Pagination,{page:2,pages:4,total:48,onPage:()=>{}}));
  assert.match(html,/16–30 dari 48 data/);
  assert.match(html,/Halaman/);
});
test('navigasi pagination tidak muncul untuk 15 data atau kurang',()=>{
  assert.equal(renderToStaticMarkup(React.createElement(Pagination,{page:1,pages:1,total:15,onPage:()=>{}})),'');
});
test('header sort memberitahukan arah urutan ke screen reader',()=>{
  const html=renderToStaticMarkup(React.createElement(SortHeading,{column:'event_date',label:'Tanggal',sortKey:'event_date',direction:'asc',onSort:()=>{}}));
  assert.match(html,/aria-sort="ascending"/);
  assert.match(html,/Tanggal/);
});
