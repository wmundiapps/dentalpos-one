# Operação rápida — Demo DentalPos One

Execute os comandos abaixo dentro da pasta `backend`.

## Listar todas as demos
```powershell
npm run demo:admin -- list
```

## Ver uma clínica
```powershell
npm run demo:admin -- info --clinicId=ID_DA_CLINICA
```

## Liberar módulos
```powershell
npm run demo:admin -- modules --clinicId=ID_DA_CLINICA --modules=agenda,patients,clinical
```

## Prorrogar
```powershell
npm run demo:admin -- extend --clinicId=ID_DA_CLINICA --days=15
```

Ou definir uma data:
```powershell
npm run demo:admin -- extend --clinicId=ID_DA_CLINICA --end=2026-12-31
```

## Converter em cliente
```powershell
npm run demo:admin -- convert --clinicId=ID_DA_CLINICA --plan=PRO
```

Nenhum desses comandos apaga pacientes, agenda ou histórico.
