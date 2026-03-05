'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Skeleton,
  Alert,
  Snackbar,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper,
  Divider,
  Switch,
  FormControlLabel,
  LinearProgress,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Work,
  School,
  Psychology,
  CardMembership,
  CloudUpload,
  PictureAsPdf,
  OpenInNew,
} from '@mui/icons-material';
import { format } from 'date-fns';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

// Types
interface Skill {
  id: string;
  name: string;
  category: string;
  sort_order: number;
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
  description: string | null;
  sort_order: number;
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
  sort_order: number;
}

interface Certification {
  id: string;
  name: string;
  issuer: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  credential_id: string | null;
  credential_url: string | null;
  sort_order: number;
}

const skillCategories = [
  'frontend',
  'backend',
  'testing',
  'devops',
  'cloud',
  'databases',
  'tools',
  'compliance',
  'methodology',
  'communication',
];

const employmentTypes = ['full-time', 'part-time', 'contract', 'freelance', 'internship'];

function LoadingSkeleton() {
  return (
    <Box>
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} height={60} sx={{ mb: 1 }} />
      ))}
    </Box>
  );
}

export default function ResumeAdminPage() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  // Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [skillForm, setSkillForm] = useState({
    name: '',
    category: 'frontend',
    sort_order: 0,
  });

  // Experiences state
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [experienceDialogOpen, setExperienceDialogOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<Experience | null>(null);
  const [experienceForm, setExperienceForm] = useState({
    title: '',
    company: '',
    location: '',
    employment_type: 'full-time',
    start_date: '',
    end_date: '',
    is_current: false,
    description: '',
    sort_order: 0,
    highlights: '',
    technologies: '',
  });

  // Education state
  const [education, setEducation] = useState<Education[]>([]);
  const [educationDialogOpen, setEducationDialogOpen] = useState(false);
  const [editingEducation, setEditingEducation] = useState<Education | null>(null);
  const [educationForm, setEducationForm] = useState({
    degree: '',
    field_of_study: '',
    school: '',
    location: '',
    start_date: '',
    end_date: '',
    description: '',
    sort_order: 0,
  });

  // Certifications state
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<Certification | null>(null);
  const [certForm, setCertForm] = useState({
    name: '',
    issuer: '',
    issue_date: '',
    expiry_date: '',
    credential_id: '',
    credential_url: '',
    sort_order: 0,
  });

  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: 'skill' | 'experience' | 'education' | 'certification';
    id: string;
    name: string;
  }>({
    open: false,
    type: 'skill',
    id: '',
    name: '',
  });

  // Resume file upload state
  const [resumeFile, setResumeFile] = useState<{
    exists: boolean;
    url?: string;
    filename?: string;
    size?: number;
    uploadedAt?: string;
  } | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  // Fetch resume file info
  const fetchResumeFile = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/resume/upload');
      if (response.ok) {
        const data = await response.json();
        setResumeFile(data);
      }
    } catch (error) {
      console.error('Error fetching resume file:', error);
    }
  }, []);

  // Handle resume file upload
  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/resume/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload resume');
      }

      setSnackbar({
        open: true,
        message: 'Resume uploaded successfully',
        severity: 'success',
      });
      fetchResumeFile();
    } catch (error) {
      console.error('Error uploading resume:', error);
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to upload resume',
        severity: 'error',
      });
    } finally {
      setUploadingResume(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Handle resume file delete
  const handleDeleteResume = async () => {
    try {
      const response = await fetch('/api/admin/resume/upload', {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete resume');

      setSnackbar({
        open: true,
        message: 'Resume deleted successfully',
        severity: 'success',
      });
      setResumeFile({ exists: false });
    } catch (error) {
      console.error('Error deleting resume:', error);
      setSnackbar({
        open: true,
        message: 'Failed to delete resume',
        severity: 'error',
      });
    }
  };

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/resume');
      if (!response.ok) throw new Error('Failed to fetch resume data');
      const data = await response.json();

      // Transform skills from grouped object to flat array
      const allSkills: Skill[] = [];
      Object.entries(data.skills).forEach(([, categorySkills]) => {
        (categorySkills as Skill[]).forEach((skill) => allSkills.push(skill));
      });
      setSkills(allSkills);

      setExperiences(data.experiences || []);
      setEducation(data.education || []);
      setCertifications(data.certifications || []);
    } catch (error) {
      console.error('Error fetching resume data:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load resume data',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchResumeFile();
  }, [fetchData, fetchResumeFile]);

  // Skills handlers
  const handleOpenSkillDialog = (skill?: Skill) => {
    if (skill) {
      setEditingSkill(skill);
      setSkillForm({
        name: skill.name,
        category: skill.category,
        sort_order: skill.sort_order,
      });
    } else {
      setEditingSkill(null);
      setSkillForm({ name: '', category: 'frontend', sort_order: 0 });
    }
    setSkillDialogOpen(true);
  };

  const handleSaveSkill = async () => {
    try {
      const url = editingSkill
        ? `/api/admin/resume/skills/${editingSkill.id}`
        : '/api/admin/resume/skills';
      const method = editingSkill ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skillForm),
      });

      if (!response.ok) throw new Error('Failed to save skill');

      setSnackbar({
        open: true,
        message: `Skill ${editingSkill ? 'updated' : 'created'} successfully`,
        severity: 'success',
      });
      setSkillDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving skill:', error);
      setSnackbar({ open: true, message: 'Failed to save skill', severity: 'error' });
    }
  };

  // Experience handlers
  const handleOpenExperienceDialog = (exp?: Experience) => {
    if (exp) {
      setEditingExperience(exp);
      setExperienceForm({
        title: exp.title,
        company: exp.company,
        location: exp.location || '',
        employment_type: exp.employment_type,
        start_date: exp.start_date ? exp.start_date.split('T')[0] : '',
        end_date: exp.end_date ? exp.end_date.split('T')[0] : '',
        is_current: exp.is_current,
        description: exp.description || '',
        sort_order: exp.sort_order,
        highlights: exp.highlights.join('\n'),
        technologies: exp.technologies.join(', '),
      });
    } else {
      setEditingExperience(null);
      setExperienceForm({
        title: '',
        company: '',
        location: '',
        employment_type: 'full-time',
        start_date: '',
        end_date: '',
        is_current: false,
        description: '',
        sort_order: 0,
        highlights: '',
        technologies: '',
      });
    }
    setExperienceDialogOpen(true);
  };

  const handleSaveExperience = async () => {
    try {
      const url = editingExperience
        ? `/api/admin/resume/experiences/${editingExperience.id}`
        : '/api/admin/resume/experiences';
      const method = editingExperience ? 'PUT' : 'POST';

      const payload = {
        ...experienceForm,
        highlights: experienceForm.highlights
          .split('\n')
          .map((h) => h.trim())
          .filter((h) => h),
        technologies: experienceForm.technologies
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save experience');

      setSnackbar({
        open: true,
        message: `Experience ${editingExperience ? 'updated' : 'created'} successfully`,
        severity: 'success',
      });
      setExperienceDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving experience:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save experience',
        severity: 'error',
      });
    }
  };

  // Education handlers
  const handleOpenEducationDialog = (edu?: Education) => {
    if (edu) {
      setEditingEducation(edu);
      setEducationForm({
        degree: edu.degree,
        field_of_study: edu.field_of_study || '',
        school: edu.school,
        location: edu.location || '',
        start_date: edu.start_date ? edu.start_date.split('T')[0] : '',
        end_date: edu.end_date ? edu.end_date.split('T')[0] : '',
        description: edu.description || '',
        sort_order: edu.sort_order,
      });
    } else {
      setEditingEducation(null);
      setEducationForm({
        degree: '',
        field_of_study: '',
        school: '',
        location: '',
        start_date: '',
        end_date: '',
        description: '',
        sort_order: 0,
      });
    }
    setEducationDialogOpen(true);
  };

  const handleSaveEducation = async () => {
    try {
      const url = editingEducation
        ? `/api/admin/resume/education/${editingEducation.id}`
        : '/api/admin/resume/education';
      const method = editingEducation ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(educationForm),
      });

      if (!response.ok) throw new Error('Failed to save education');

      setSnackbar({
        open: true,
        message: `Education ${editingEducation ? 'updated' : 'created'} successfully`,
        severity: 'success',
      });
      setEducationDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving education:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save education',
        severity: 'error',
      });
    }
  };

  // Certification handlers
  const handleOpenCertDialog = (cert?: Certification) => {
    if (cert) {
      setEditingCert(cert);
      setCertForm({
        name: cert.name,
        issuer: cert.issuer || '',
        issue_date: cert.issue_date ? cert.issue_date.split('T')[0] : '',
        expiry_date: cert.expiry_date ? cert.expiry_date.split('T')[0] : '',
        credential_id: cert.credential_id || '',
        credential_url: cert.credential_url || '',
        sort_order: cert.sort_order,
      });
    } else {
      setEditingCert(null);
      setCertForm({
        name: '',
        issuer: '',
        issue_date: '',
        expiry_date: '',
        credential_id: '',
        credential_url: '',
        sort_order: 0,
      });
    }
    setCertDialogOpen(true);
  };

  const handleSaveCertification = async () => {
    try {
      const url = editingCert
        ? `/api/admin/resume/certifications/${editingCert.id}`
        : '/api/admin/resume/certifications';
      const method = editingCert ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(certForm),
      });

      if (!response.ok) throw new Error('Failed to save certification');

      setSnackbar({
        open: true,
        message: `Certification ${editingCert ? 'updated' : 'created'} successfully`,
        severity: 'success',
      });
      setCertDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving certification:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save certification',
        severity: 'error',
      });
    }
  };

  // Delete handler
  const handleDelete = async () => {
    try {
      const { type, id } = deleteDialog;
      const response = await fetch(`/api/admin/resume/${type}s/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');

      setSnackbar({
        open: true,
        message: `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`,
        severity: 'success',
      });
      setDeleteDialog({ ...deleteDialog, open: false });
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      setSnackbar({
        open: true,
        message: 'Failed to delete',
        severity: 'error',
      });
    }
  };

  // Group skills by category for display
  const skillsByCategory = skills.reduce(
    (acc, skill) => {
      if (!acc[skill.category]) acc[skill.category] = [];
      acc[skill.category].push(skill);
      return acc;
    },
    {} as Record<string, Skill[]>
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          Resume Management
        </Typography>
      </Box>

      {/* Resume PDF Upload Section */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <PictureAsPdf sx={{ fontSize: 40, color: 'error.main' }} />
            <Box>
              <Typography variant="h6">Resume PDF</Typography>
              <Typography variant="body2" color="text.secondary">
                {resumeFile?.exists
                  ? `Current file: ${resumeFile.filename} (${resumeFile.size ? Math.round(resumeFile.size / 1024) + ' KB' : 'Unknown size'})`
                  : 'No resume uploaded yet'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {resumeFile?.exists && resumeFile.url && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<OpenInNew />}
                  href={resumeFile.url}
                  target="_blank"
                >
                  Preview
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<Delete />}
                  onClick={handleDeleteResume}
                >
                  Delete
                </Button>
              </>
            )}
            <Button
              variant="contained"
              component="label"
              startIcon={<CloudUpload />}
              disabled={uploadingResume}
            >
              {resumeFile?.exists ? 'Replace' : 'Upload'} Resume
              <input
                type="file"
                hidden
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleResumeUpload}
              />
            </Button>
          </Box>
        </Box>
        {uploadingResume && <LinearProgress sx={{ mt: 2 }} />}
      </Card>

      <Card sx={{ p: 3 }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<Psychology />} label="Skills" iconPosition="start" />
          <Tab icon={<Work />} label="Experience" iconPosition="start" />
          <Tab icon={<School />} label="Education" iconPosition="start" />
          <Tab icon={<CardMembership />} label="Certifications" iconPosition="start" />
        </Tabs>

        {/* Skills Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenSkillDialog()}>
              Add Skill
            </Button>
          </Box>

          {loading ? (
            <LoadingSkeleton />
          ) : (
            Object.entries(skillsByCategory).map(([category, categorySkills]) => (
              <Paper key={category} sx={{ mb: 2, p: 2 }}>
                <Typography
                  variant="subtitle1"
                  fontWeight="bold"
                  sx={{ mb: 1, textTransform: 'capitalize' }}
                >
                  {category}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {categorySkills.map((skill) => (
                    <Chip
                      key={skill.id}
                      label={skill.name}
                      onDelete={() =>
                        setDeleteDialog({
                          open: true,
                          type: 'skill',
                          id: skill.id,
                          name: skill.name,
                        })
                      }
                      onClick={() => handleOpenSkillDialog(skill)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Paper>
            ))
          )}
        </TabPanel>

        {/* Experience Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleOpenExperienceDialog()}
            >
              Add Experience
            </Button>
          </Box>

          {loading ? (
            <LoadingSkeleton />
          ) : (
            <List>
              {experiences.map((exp, index) => (
                <Box key={exp.id}>
                  {index > 0 && <Divider />}
                  <ListItem sx={{ py: 2 }}>
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Typography variant="subtitle1" fontWeight="bold">
                            {exp.title}
                          </Typography>
                          {exp.is_current && <Chip label="Current" size="small" color="success" />}
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2" color="text.secondary">
                            {exp.company} • {exp.location} • {exp.employment_type}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {exp.start_date && format(new Date(exp.start_date), 'MMM yyyy')} -{' '}
                            {exp.is_current
                              ? 'Present'
                              : exp.end_date && format(new Date(exp.end_date), 'MMM yyyy')}
                          </Typography>
                          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {exp.technologies.slice(0, 5).map((tech, i) => (
                              <Chip key={i} label={tech} size="small" variant="outlined" />
                            ))}
                            {exp.technologies.length > 5 && (
                              <Chip
                                label={`+${exp.technologies.length - 5}`}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        </>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton onClick={() => handleOpenExperienceDialog(exp)}>
                        <Edit />
                      </IconButton>
                      <IconButton
                        onClick={() =>
                          setDeleteDialog({
                            open: true,
                            type: 'experience',
                            id: exp.id,
                            name: exp.title,
                          })
                        }
                      >
                        <Delete />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </TabPanel>

        {/* Education Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleOpenEducationDialog()}
            >
              Add Education
            </Button>
          </Box>

          {loading ? (
            <LoadingSkeleton />
          ) : (
            <List>
              {education.map((edu, index) => (
                <Box key={edu.id}>
                  {index > 0 && <Divider />}
                  <ListItem sx={{ py: 2 }}>
                    <ListItemText
                      primary={
                        <Typography variant="subtitle1" fontWeight="bold">
                          {edu.degree}
                          {edu.field_of_study && ` in ${edu.field_of_study}`}
                        </Typography>
                      }
                      secondary={
                        <>
                          <Typography variant="body2" color="text.secondary">
                            {edu.school}
                            {edu.location && ` • ${edu.location}`}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {edu.start_date && format(new Date(edu.start_date), 'MMM yyyy')} -{' '}
                            {edu.end_date && format(new Date(edu.end_date), 'MMM yyyy')}
                          </Typography>
                        </>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton onClick={() => handleOpenEducationDialog(edu)}>
                        <Edit />
                      </IconButton>
                      <IconButton
                        onClick={() =>
                          setDeleteDialog({
                            open: true,
                            type: 'education',
                            id: edu.id,
                            name: edu.degree,
                          })
                        }
                      >
                        <Delete />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </TabPanel>

        {/* Certifications Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenCertDialog()}>
              Add Certification
            </Button>
          </Box>

          {loading ? (
            <LoadingSkeleton />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Issuer</TableCell>
                    <TableCell>Issue Date</TableCell>
                    <TableCell>Expiry</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {certifications.map((cert) => (
                    <TableRow key={cert.id}>
                      <TableCell>
                        <Typography fontWeight="medium">{cert.name}</Typography>
                        {cert.credential_id && (
                          <Typography variant="caption" color="text.secondary">
                            ID: {cert.credential_id}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{cert.issuer || '-'}</TableCell>
                      <TableCell>
                        {cert.issue_date ? format(new Date(cert.issue_date), 'MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        {cert.expiry_date
                          ? format(new Date(cert.expiry_date), 'MMM yyyy')
                          : 'No Expiry'}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton onClick={() => handleOpenCertDialog(cert)}>
                          <Edit />
                        </IconButton>
                        <IconButton
                          onClick={() =>
                            setDeleteDialog({
                              open: true,
                              type: 'certification',
                              id: cert.id,
                              name: cert.name,
                            })
                          }
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Card>

      {/* Skill Dialog */}
      <Dialog
        open={skillDialogOpen}
        onClose={() => setSkillDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingSkill ? 'Edit Skill' : 'Add Skill'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Name"
            value={skillForm.name}
            onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
          />
          <TextField
            fullWidth
            select
            label="Category"
            value={skillForm.category}
            onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value })}
            sx={{ mb: 2 }}
          >
            {skillCategories.map((cat) => (
              <MenuItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            type="number"
            label="Sort Order"
            value={skillForm.sort_order}
            onChange={(e) =>
              setSkillForm({
                ...skillForm,
                sort_order: parseInt(e.target.value) || 0,
              })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkillDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSkill}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Experience Dialog */}
      <Dialog
        open={experienceDialogOpen}
        onClose={() => setExperienceDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingExperience ? 'Edit Experience' : 'Add Experience'}</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
              mt: 2,
            }}
          >
            <TextField
              fullWidth
              label="Job Title"
              value={experienceForm.title}
              onChange={(e) => setExperienceForm({ ...experienceForm, title: e.target.value })}
            />
            <TextField
              fullWidth
              label="Company"
              value={experienceForm.company}
              onChange={(e) => setExperienceForm({ ...experienceForm, company: e.target.value })}
            />
            <TextField
              fullWidth
              label="Location"
              value={experienceForm.location}
              onChange={(e) => setExperienceForm({ ...experienceForm, location: e.target.value })}
            />
            <TextField
              fullWidth
              select
              label="Employment Type"
              value={experienceForm.employment_type}
              onChange={(e) =>
                setExperienceForm({
                  ...experienceForm,
                  employment_type: e.target.value,
                })
              }
            >
              {employmentTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              type="date"
              label="Start Date"
              value={experienceForm.start_date}
              onChange={(e) =>
                setExperienceForm({
                  ...experienceForm,
                  start_date: e.target.value,
                })
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              type="date"
              label="End Date"
              value={experienceForm.end_date}
              onChange={(e) =>
                setExperienceForm({
                  ...experienceForm,
                  end_date: e.target.value,
                })
              }
              InputLabelProps={{ shrink: true }}
              disabled={experienceForm.is_current}
            />
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={experienceForm.is_current}
                onChange={(e) =>
                  setExperienceForm({
                    ...experienceForm,
                    is_current: e.target.checked,
                    end_date: e.target.checked ? '' : experienceForm.end_date,
                  })
                }
              />
            }
            label="Current Position"
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={experienceForm.description}
            onChange={(e) =>
              setExperienceForm({
                ...experienceForm,
                description: e.target.value,
              })
            }
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Highlights (one per line)"
            value={experienceForm.highlights}
            onChange={(e) =>
              setExperienceForm({
                ...experienceForm,
                highlights: e.target.value,
              })
            }
            sx={{ mt: 2 }}
            helperText="Enter each highlight on a new line"
          />
          <TextField
            fullWidth
            label="Technologies (comma-separated)"
            value={experienceForm.technologies}
            onChange={(e) =>
              setExperienceForm({
                ...experienceForm,
                technologies: e.target.value,
              })
            }
            sx={{ mt: 2 }}
            helperText="e.g., React, TypeScript, Node.js"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExperienceDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveExperience}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Education Dialog */}
      <Dialog
        open={educationDialogOpen}
        onClose={() => setEducationDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingEducation ? 'Edit Education' : 'Add Education'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Degree"
            value={educationForm.degree}
            onChange={(e) => setEducationForm({ ...educationForm, degree: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
          />
          <TextField
            fullWidth
            label="Field of Study"
            value={educationForm.field_of_study}
            onChange={(e) =>
              setEducationForm({
                ...educationForm,
                field_of_study: e.target.value,
              })
            }
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="School"
            value={educationForm.school}
            onChange={(e) => setEducationForm({ ...educationForm, school: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Location"
            value={educationForm.location}
            onChange={(e) => setEducationForm({ ...educationForm, location: e.target.value })}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <TextField
              fullWidth
              type="date"
              label="Start Date"
              value={educationForm.start_date}
              onChange={(e) =>
                setEducationForm({
                  ...educationForm,
                  start_date: e.target.value,
                })
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              type="date"
              label="End Date"
              value={educationForm.end_date}
              onChange={(e) => setEducationForm({ ...educationForm, end_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={educationForm.description}
            onChange={(e) =>
              setEducationForm({
                ...educationForm,
                description: e.target.value,
              })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEducationDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEducation}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Certification Dialog */}
      <Dialog
        open={certDialogOpen}
        onClose={() => setCertDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingCert ? 'Edit Certification' : 'Add Certification'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Certification Name"
            value={certForm.name}
            onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
          />
          <TextField
            fullWidth
            label="Issuer"
            value={certForm.issuer}
            onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <TextField
              fullWidth
              type="date"
              label="Issue Date"
              value={certForm.issue_date}
              onChange={(e) => setCertForm({ ...certForm, issue_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              type="date"
              label="Expiry Date"
              value={certForm.expiry_date}
              onChange={(e) => setCertForm({ ...certForm, expiry_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <TextField
            fullWidth
            label="Credential ID"
            value={certForm.credential_id}
            onChange={(e) => setCertForm({ ...certForm, credential_id: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Credential URL"
            value={certForm.credential_url}
            onChange={(e) => setCertForm({ ...certForm, credential_url: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCertDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveCertification}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{deleteDialog.name}&quot;? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
