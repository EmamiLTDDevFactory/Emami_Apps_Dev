import {
  Card,
  CardContent,
  Typography,
  TextField,
  Grid,
  Button,
  Chip,
  Box,
} from "@mui/material";

export default function CAPACard({
  capa,
}) {
  return (
    <Card
      sx={{
        mb: 3,
        borderRadius: 3,
        boxShadow: 3,
      }}
    >
      <CardContent>

        <Grid
          container
          justifyContent="space-between"
          alignItems="center"
        >
          <Grid item>
            <Typography
              variant="h6"
            >
              {capa.capaNo}
            </Typography>
          </Grid>

          <Grid item>
            <Chip
              label={capa.status}
              color="warning"
            />
          </Grid>
        </Grid>

        <Typography
          sx={{ mt: 2 }}
        >
          Observation Area
        </Typography>

        <Typography
          color="text.secondary"
        >
          {capa.area}
        </Typography>

        <Typography
          sx={{ mt: 2 }}
        >
          Observation
        </Typography>

        <Typography
          color="text.secondary"
        >
          {capa.observation}
        </Typography>

        <Grid
          container
          spacing={2}
          sx={{ mt: 2 }}
        >
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Root Cause"
              multiline
              rows={2}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Preventive Action"
              multiline
              rows={3}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              type="date"
              fullWidth
              InputLabelProps={{
                shrink: true,
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Button
              variant="outlined"
              fullWidth
            >
              Upload Evidence
            </Button>
          </Grid>
        </Grid>

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 3,
          }}
        >
          <Button
            variant="contained"
          >
            Save CAPA
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}