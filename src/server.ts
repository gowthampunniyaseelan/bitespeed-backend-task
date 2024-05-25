import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { sequelize, Contact } from './models/contact';
import dotenv from 'dotenv';
import { Op } from 'sequelize';
dotenv.config();

const app = express();
app.use(bodyParser.json());

interface IdentifyRequest {
  email?: string;
  phoneNumber?: string;
}

app.post('/identify', async (req: Request, res: Response) => {
  const { email, phoneNumber }: IdentifyRequest = req.body;
  
  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'Email or phone number is required' });
  }

  const contacts = await Contact.findAll({
    where: {
      [Op.or]: [
        { email: email },
        { phoneNumber: phoneNumber }
      ]
    }
  });

  if (contacts.length === 0) {
    const newContact = await Contact.create({
      email: email,
      phoneNumber: phoneNumber,
      linkPrecedence: 'primary',
    });
    return res.json({
      contact: {
        primaryContactId: newContact.id,
        emails: [newContact.email].filter(Boolean),
        phoneNumbers: [newContact.phoneNumber].filter(Boolean),
        secondaryContactIds: []
      }
    });
  }

  let primaryContact = contacts.find(contact => contact.linkPrecedence === 'primary');
  if (!primaryContact) {
    primaryContact = contacts[0];
    await primaryContact.update({ linkPrecedence: 'primary' });
  }

  const secondaryContacts = contacts.filter(contact => contact.id !== primaryContact.id);

  for (let contact of secondaryContacts) {
    if (contact.linkPrecedence === 'primary') {
      await contact.update({
        linkPrecedence: 'secondary',
        linkedId: primaryContact.id
      });
    }
  }

  if (!contacts.some(contact => contact.email === email && contact.phoneNumber === phoneNumber)) {
    const newContact = await Contact.create({
      email: email,
      phoneNumber: phoneNumber,
      linkPrecedence: 'secondary',
      linkedId: primaryContact.id
    });
    secondaryContacts.push(newContact);
  }

  return res.json({
    contact: {
      primaryContactId: primaryContact.id,
      emails: [primaryContact.email, ...secondaryContacts.map(contact => contact.email)].filter(Boolean),
      phoneNumbers: [primaryContact.phoneNumber, ...secondaryContacts.map(contact => contact.phoneNumber)].filter(Boolean),
      secondaryContactIds: secondaryContacts.map(contact => contact.id)
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  sequelize.sync();
});
