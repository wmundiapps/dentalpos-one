import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import PlaceIcon from "@mui/icons-material/Place";

import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { getInstitutionProfile, listCampuses, osmViewUrl, type Campus, type InstitutionProfile } from "../services/InstitutionApi";

export default function Footer() {
  const [profile, setProfile] = useState<InstitutionProfile | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([getInstitutionProfile(), listCampuses()])
      .then(([p, c]) => {
        if (!active) return;
        setProfile(p);
        setCampuses(c.filter((campus) => campus.isActive));
      })
      .catch(() => {
        // Rodapé institucional é informativo; falha silenciosa mantém o app utilizável.
      });
    return () => { active = false; };
  }, []);

  const legalName = profile?.name || appConfig.name;
  const addressLine = profile ? [profile.address, profile.city, profile.state].filter(Boolean).join(", ") : "";

  return (
    <Box
      component="footer"
      sx={{
        px: 3,
        py: 2.5,
        bgcolor: "background.paper",
        borderTop: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      {profile && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 0.5, md: 3 }} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary">
            <strong>{legalName}</strong>{profile.cnpj ? ` • CNPJ ${profile.cnpj}` : ""}
          </Typography>
          {addressLine && <Typography variant="caption" color="text.secondary">{addressLine}{profile.zipCode ? ` — ${profile.zipCode}` : ""}</Typography>}
          {profile.phone && <Typography variant="caption" color="text.secondary">Tel. {profile.phone}</Typography>}
          {profile.email && <Link href={`mailto:${profile.email}`} variant="caption" underline="hover">{profile.email}</Link>}
          {profile.site && <Link href={profile.site} target="_blank" rel="noreferrer" variant="caption" underline="hover">Site</Link>}
          {profile.contactUrl && <Link href={profile.contactUrl} target="_blank" rel="noreferrer" variant="caption" underline="hover">Fale conosco</Link>}
          {(profile.ombudsmanEmail || profile.ombudsmanPhone) && (
            <Link href={profile.ombudsmanEmail ? `mailto:${profile.ombudsmanEmail}` : undefined} variant="caption" underline="hover">
              Ouvidoria{profile.ombudsmanPhone ? ` — ${profile.ombudsmanPhone}` : ""}
            </Link>
          )}
        </Stack>
      )}

      {campuses.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {campuses.map((campus) => (
            <Chip
              key={campus.id}
              size="small"
              variant="outlined"
              icon={<PlaceIcon fontSize="small" />}
              label={`${campus.name}${campus.addressCity ? ` — ${campus.addressCity}${campus.addressState ? `/${campus.addressState}` : ""}` : ""}`}
              component={campus.mapLat != null && campus.mapLng != null ? "a" : "div"}
              href={campus.mapLat != null && campus.mapLng != null ? osmViewUrl(campus.mapLat, campus.mapLng) : undefined}
              target={campus.mapLat != null ? "_blank" : undefined}
              rel={campus.mapLat != null ? "noreferrer" : undefined}
              clickable={campus.mapLat != null && campus.mapLng != null}
            />
          ))}
        </Stack>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          © 2026 <BrandName /> •{" "}
          <span translate="no" className="notranslate">
            {appConfig.developer}
          </span>
        </Typography>

        <Chip size="small" label={appConfig.version} color="primary" variant="outlined" />
      </Box>
    </Box>
  );
}
