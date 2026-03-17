# EdeVida Web

Painel web para visualizacao de historico, metricas e relatorios.

A implementacao inicial usa arquivos estaticos em `public/` e eh servida pela API em:

- `/painel` (pagina principal)
- `/web/*` (assets estaticos)

Fluxos suportados no MVP:

- analise nutricional por texto (OpenAI)
- registro de agua
- cadastro de perfil, medidas corporais, bioimpedancia e exames
- upload de anexo de bioimpedancia com leitura por IA
- upload de anexo de exame (PDF/imagem) com extracao por IA
- registro de treino
- geracao de relatorio diario
- recomendacao inicial de treino (modulo base de personal trainer)
