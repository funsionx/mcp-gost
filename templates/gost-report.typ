#import "@preview/modern-g7-32:0.1.0": project

#let doc = json("data.json")

#let title = "__TITLE__"
#let university = "__UNIVERSITY__"
#let faculty = "__FACULTY__"
#let department = "__DEPARTMENT__"
#let subtitle = "__SUBTITLE__"
#let author = "__AUTHOR__"
#let group = "__GROUP__"
#let supervisor = "__SUPERVISOR__"
#let city = "__CITY__"
#let year = __YEAR__
#let abstract = "__ABSTRACT__"
#let introduction = "__INTRODUCTION__"
#let conclusion = "__CONCLUSION__"
__SECTIONS__
__APPENDICES__
__BIBLIOGRAPHY__

#show: project.with(
  title: title,
  university: university,
  faculty: faculty,
  department: department,
  author: author,
  group: group,
  supervisor: supervisor,
  city: city,
  year: year,
)

= Аннотация
#par(justify: true)[#abstract]

= Введение
#par(justify: true)[#introduction]

#for section in sections [
  #let heading = if section.level == 1 {
    heading(level: 1, section.title)
  } else if section.level == 2 {
    heading(level: 2, section.title)
  } else {
    heading(level: 3, section.title)
  }
  #heading
  #par(justify: true)[#section.content]
]

= Заключение
#par(justify: true)[#conclusion]

= Список использованных источников
#for item in bibliography [
  + #item.raw
]

#if appendices.len() > 0 [
  = Приложения
  #for app in appendices [
    == #app.title
    #par(justify: true)[#app.content]
  ]
]