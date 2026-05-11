#import "@preview/modern-g7-32:0.2.0": gost, abstract as gost-abstract, appendixes

#let doc-title       = "__TITLE__"
#let doc-subtitle    = "__SUBTITLE__"
#let doc-university  = "__UNIVERSITY__"
#let doc-faculty     = "__FACULTY__"
#let doc-department  = "__DEPARTMENT__"
#let doc-author      = "__AUTHOR__"
#let doc-group       = "__GROUP__"
#let doc-supervisor  = "__SUPERVISOR__"
#let doc-city        = "__CITY__"
#let doc-year        = __YEAR__
#let doc-abstract    = "__ABSTRACT__"
#let doc-intro       = "__INTRODUCTION__"
#let doc-conclusion  = "__CONCLUSION__"
__SECTIONS__
__APPENDICES__
__REFS__

#show: gost.with(
  ministry: doc-university,
  organization: (
    full: doc-faculty,
    short: doc-department,
  ),
  report-type: if doc-subtitle != "" { doc-subtitle } else { "Отчёт" },
  subject: doc-title,
  bare-subject: false,
  manager: (
    name: doc-supervisor,
    position: "Научный руководитель",
    title: "Руководитель работы,",
  ),
  performers: (
    (
      name: doc-author,
      position: if doc-group != "" { "Студент группы " + doc-group } else { "Студент" },
    ),
  ),
  city: doc-city,
)

#gost-abstract(doc-title, doc-subtitle)[
  #doc-abstract
]

#outline()

= Введение
#par(justify: true)[#doc-intro]

#for section in sections [
  #if section.level == 1 [
    = #section.title
  ] else if section.level == 2 [
    == #section.title
  ] else [
    === #section.title
  ]
  #par(justify: true)[#section.content]
]

= Заключение
#par(justify: true)[#doc-conclusion]

#if refs.len() > 0 [
  = Список использованных источников
  #for item in refs [
    + #item.raw
  ]
]

#if appendices.len() > 0 [
  #show: appendixes
  #for app in appendices [
    = #app.title
    #par(justify: true)[#app.content]
  ]
]
