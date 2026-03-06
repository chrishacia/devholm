'use client';

import {
  Box,
  Typography,
  Container,
  Chip,
  Divider,
  Button,
  Paper,
  alpha,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { Download, Email, LinkedIn, GitHub } from '@mui/icons-material';
import { AuthAwareMainLayout } from '@/components';
import Link from '@/components/common/Link';
import { siteConfig } from '@/config';
import { format } from 'date-fns';

interface Skill {
  id: string;
  name: string;
  category: string;
}

interface Experience {
  id: string;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  highlights: string[];
  technologies: string[];
}

interface Education {
  id: string;
  degree: string;
  field_of_study: string | null;
  school: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

interface Certification {
  id: string;
  name: string;
  issuer: string | null;
}

interface ResumeData {
  skills: Record<string, Skill[]>;
  experiences: Experience[];
  education: Education[];
  certifications: Certification[];
}

interface ResumePageClientProps {
  resume: ResumeData;
}

function formatDateRange(startDate: string, endDate: string | null): string {
  const start = format(new Date(startDate), 'MMM yyyy');
  const end = endDate ? format(new Date(endDate), 'MMM yyyy') : 'Present';
  return `${start} – ${end}`;
}

// Category display names
const categoryNames: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  testing: 'Testing',
  devops: 'DevOps & CI/CD',
  cloud: 'Cloud & Infrastructure',
  databases: 'Databases',
  tools: 'Tools & Platforms',
  compliance: 'Security & Compliance',
  methodology: 'Methodology',
  communication: 'Communication',
};

export default function ResumePage({ resume }: ResumePageClientProps) {
  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Resume
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
            {siteConfig.author.name} • Full-Stack Developer
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<Download />}
              href="/assets/resume/2025_Resume_Christopher_Hacia.pdf"
              download
            >
              Download PDF
            </Button>
            <Button
              variant="outlined"
              startIcon={<Email />}
              component={Link}
              href={`mailto:${siteConfig.author.email}`}
            >
              Contact Me
            </Button>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              size="small"
              startIcon={<LinkedIn sx={{ fontSize: '1rem' }} />}
              component={Link}
              href={`https://linkedin.com/in/${siteConfig.social.linkedin}`}
              target="_blank"
              sx={{ gap: 1 }}
            >
              LinkedIn
            </Button>
            <Button
              size="small"
              startIcon={<GitHub sx={{ fontSize: '1rem' }} />}
              component={Link}
              href={`https://github.com/${siteConfig.social.github}`}
              target="_blank"
              sx={{ gap: 1 }}
            >
              GitHub
            </Button>
          </Box>
        </Box>

        <Divider sx={{ mb: 6 }} />

        <>
          {/* Skills Section */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
              Skills
            </Typography>
            <Paper sx={{ p: 3 }}>
              {Object.entries(resume.skills).map(([category, skills], index) => (
                <Box
                  key={category}
                  sx={{ mb: index < Object.keys(resume.skills).length - 1 ? 3 : 0 }}
                >
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    sx={{
                      mb: 1.5,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontSize: '0.75rem',
                    }}
                  >
                    {categoryNames[category] || category}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {skills.map((skill) => (
                      <Chip key={skill.id} label={skill.name} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              ))}
            </Paper>
          </Box>

          {/* Experience Section */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
              Experience
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {resume.experiences.map((exp) => (
                <Paper
                  key={exp.id}
                  sx={{
                    p: 3,
                    position: 'relative',
                    ...(exp.is_current && {
                      borderLeft: 3,
                      borderColor: 'primary.main',
                    }),
                  }}
                >
                  <Box sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: 1,
                      }}
                    >
                      <Box>
                        <Typography variant="h5" component="h3" sx={{ fontWeight: 600 }}>
                          {exp.title}
                        </Typography>
                        <Typography variant="subtitle1" color="primary">
                          {exp.company}
                          {exp.employment_type === 'contract' && (
                            <Chip
                              label="Contract"
                              size="small"
                              sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateRange(exp.start_date, exp.end_date)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {exp.location}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                  <List dense disablePadding sx={{ mb: 2 }}>
                    {exp.highlights.map((highlight, i) => (
                      <ListItem key={i} sx={{ pl: 0, py: 0.5 }}>
                        <ListItemText
                          primary={`• ${highlight}`}
                          primaryTypographyProps={{
                            variant: 'body2',
                            color: 'text.secondary',
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {exp.technologies.map((tech) => (
                      <Chip key={tech} label={tech} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Paper>
              ))}
            </Box>
          </Box>

          {/* Education Section */}
          {resume.education.length > 0 && (
            <Box sx={{ mb: 6 }}>
              <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                Education
              </Typography>
              {resume.education.map((edu) => (
                <Paper key={edu.id} sx={{ p: 3 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
                        {edu.degree}
                      </Typography>
                      <Typography variant="body1" color="primary">
                        {edu.school}
                      </Typography>
                      {edu.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {edu.description}
                        </Typography>
                      )}
                    </Box>
                    {edu.location && (
                      <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                        <Typography variant="body2" color="text.secondary">
                          {edu.location}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Paper>
              ))}
            </Box>
          )}

          {/* Certifications */}
          {resume.certifications.length > 0 && (
            <Box>
              <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                Certifications & Awareness Training
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  background: (theme) =>
                    theme.palette.mode === 'dark'
                      ? alpha(theme.palette.primary.dark, 0.1)
                      : alpha(theme.palette.primary.light, 0.1),
                }}
              >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {resume.certifications.map((cert) => (
                    <Chip
                      key={cert.id}
                      label={cert.issuer ? `${cert.name} (${cert.issuer})` : cert.name}
                      color="primary"
                      variant="outlined"
                      size="medium"
                    />
                  ))}
                </Box>
              </Paper>
            </Box>
          )}
        </>
      </Container>
    </AuthAwareMainLayout>
  );
}
